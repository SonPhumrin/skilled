import type { ModelOption, PermissionDecision, PermissionMode } from "../../shared/types";
import { RpcError, StdioRpc } from "./rpc";
import { summarizeToolResult } from "./summarize";
import type { AgentDriver, TurnInput } from "./types";

// The slices of Codex's app-server protocol (`codex app-server generate-ts`) this driver uses.
type ThreadItem =
  | { type: "agentMessage"; id: string; text: string }
  | { type: "reasoning"; id: string; summary: string[]; content: string[] }
  | { type: "commandExecution"; id: string; command: string; status: string; aggregatedOutput: string | null; exitCode: number | null }
  | { type: "fileChange"; id: string; changes: { path: string; kind: unknown }[]; status: string }
  | { type: "mcpToolCall"; id: string; server: string; tool: string; status: string; error?: { message: string } | null }
  | { type: "webSearch"; id: string; query?: string }
  | { type: string; id: string };
interface Turn {
  id: string;
  status: "completed" | "interrupted" | "failed" | "inProgress";
  error: { message: string } | null;
  durationMs: number | null;
}
interface TokenBreakdown {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface CodexConfig {
  command: string;
  args: string[];
  clientVersion: string;
  /** skilled's model-invoked skills, registered as an extra skills root. */
  skillsDir?: () => string;
}

export const CODEX_DEFAULT_MODEL = "default";

/** Ask / Auto-edit / Full as Codex approval policy and sandbox. */
export function codexPolicy(mode: PermissionMode): { approvalPolicy: string; sandbox: string } {
  switch (mode) {
    case "full":
      return { approvalPolicy: "never", sandbox: "danger-full-access" };
    case "auto-edit":
      return { approvalPolicy: "on-request", sandbox: "workspace-write" };
    default:
      return { approvalPolicy: "untrusted", sandbox: "workspace-write" };
  }
}

export function codexDecision(d: PermissionDecision): "accept" | "acceptForSession" | "decline" {
  return d === "allow-always" ? "acceptForSession" : d === "allow-once" ? "accept" : "decline";
}

interface TurnState {
  input: TurnInput;
  threadId: string;
  turnId: string | null;
  deltas: Map<string, string>;
  usage: TokenBreakdown | null;
  /** Retrying errors already shown this turn, so each shows once. */
  retrying: Set<string>;
  done: (turn: Turn) => void;
}

/**
 * Codex through `codex app-server`: one app-server process for every thread
 * (it runs many at once), threads resumed by id from Codex's own history.
 */
export function createCodexDriver(config: CodexConfig): AgentDriver {
  let rpc: StdioRpc | null = null;
  let ready: Promise<void> | null = null;
  let models: ModelOption[] = [];
  const turns = new Map<string, TurnState>(); // by Codex thread id

  const onNotification = (method: string, params: unknown) => {
    const p = params as { threadId?: string; turnId?: string; itemId?: string; delta?: string; item?: ThreadItem; turn?: Turn };
    const t = p.threadId ? turns.get(p.threadId) : undefined;
    if (!t) return;
    switch (method) {
      case "item/agentMessage/delta":
        if (p.itemId && p.delta) {
          t.deltas.set(p.itemId, (t.deltas.get(p.itemId) ?? "") + p.delta);
          t.input.onTextDelta(p.delta);
        }
        return;
      case "item/started":
        if (p.item) onItemStarted(t, p.item);
        return;
      case "item/completed":
        if (p.item) onItemCompleted(t, p.item);
        return;
      case "thread/tokenUsage/updated":
        t.usage = (params as { tokenUsage: { last: TokenBreakdown } }).tokenUsage.last;
        return;
      case "turn/started":
        t.turnId = (params as { turn: Turn }).turn.id;
        return;
      case "turn/completed":
        if (p.turn) t.done(p.turn);
        return;
      case "error": {
        const e = params as { error: { message: string }; willRetry: boolean };
        if (!e.willRetry) t.input.onEvent({ kind: "error", message: `Codex: ${e.error.message}` });
        else if (!t.retrying.has(e.error.message)) {
          // Often a missing login: say so instead of spinning silently.
          t.retrying.add(e.error.message);
          t.input.onEvent({ kind: "notice", text: `Codex hit an error and is retrying: ${e.error.message}` });
        }
        return;
      }
      default:
        return;
    }
  };

  const onItemStarted = (t: TurnState, item: ThreadItem) => {
    const tool = toolFor(item);
    if (tool) t.input.onEvent({ kind: "tool-use", toolUseId: item.id, ...tool });
  };

  const onItemCompleted = (t: TurnState, item: ThreadItem) => {
    if (item.type === "agentMessage") {
      const text = (item as { text: string }).text || t.deltas.get(item.id) || "";
      t.deltas.delete(item.id);
      if (text.trim()) t.input.onEvent({ kind: "assistant-text", text });
      return;
    }
    if (item.type === "reasoning") {
      const r = item as { summary: string[] };
      const text = r.summary.join("\n\n").trim();
      if (text) t.input.onEvent({ kind: "thinking", text });
      return;
    }
    if (!toolFor(item)) return;
    const status = (item as { status?: string }).status ?? "completed";
    const failed = status === "failed" || status === "declined";
    let summary = failed ? "Failed" : "Done";
    if (item.type === "commandExecution") {
      const c = item as { aggregatedOutput: string | null; exitCode: number | null };
      summary = summarizeToolResult(c.aggregatedOutput ?? "") || (c.exitCode !== null ? `exit ${c.exitCode}` : summary);
    } else if (item.type === "mcpToolCall") {
      const m = item as { error?: { message: string } | null };
      if (m.error) summary = m.error.message;
    }
    t.input.onEvent({ kind: "tool-result", toolUseId: item.id, isError: failed, summary });
  };

  const onRequest = async (method: string, params: unknown): Promise<unknown> => {
    const p = params as { threadId: string; command?: string | null; reason?: string | null; itemId: string };
    const t = turns.get(p.threadId);
    if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
      if (!t) return { decision: "decline" };
      const isCommand = method === "item/commandExecution/requestApproval";
      const decision = await t.input.requestPermission({
        toolName: isCommand ? "Run" : "Edit",
        summary: (isCommand ? p.command : p.reason) ?? (isCommand ? "a command" : "file changes"),
        canAlwaysAllow: true,
      });
      return { decision: codexDecision(decision) };
    }
    throw new RpcError(-32601, `${method} is not supported by this client`);
  };

  const start = (cwd: string): Promise<void> => {
    if (rpc?.alive && ready) return ready;
    rpc = StdioRpc.spawn(config.command, config.args, { cwd, env: process.env }, {
      onNotification,
      onRequest,
      onExit: () => {
        for (const t of turns.values()) t.done({ id: t.turnId ?? "", status: "failed", error: { message: "Codex exited." }, durationMs: null });
        rpc = null;
        ready = null;
      },
    });
    const conn = rpc;
    ready = (async () => {
      await conn.request("initialize", {
        clientInfo: { name: "unskilled", title: "UnSkilled", version: config.clientVersion },
        capabilities: null,
      });
      conn.notify("initialized");
      if (config.skillsDir) {
        await conn.request("skills/extraRoots/set", { extraRoots: [config.skillsDir()] }).catch(() => {});
      }
      const list = await conn.request<{ data: { id: string; displayName: string; hidden: boolean }[] }>("model/list", {}).catch(() => null);
      if (list) models = list.data.filter((m) => !m.hidden).map((m) => ({ id: m.id, label: m.displayName }));
    })();
    ready.catch(() => {
      rpc?.close();
      rpc = null;
      ready = null;
    });
    return ready;
  };

  return {
    id: "codex",
    label: "Codex",
    defaultModel: CODEX_DEFAULT_MODEL,
    skillCallPrefix: "",
    models: () => [{ id: CODEX_DEFAULT_MODEL, label: "Codex default" }, ...models],
    async runTurn(input) {
      const policy = codexPolicy(input.permissionMode);
      const model = input.model === CODEX_DEFAULT_MODEL ? null : input.model;
      let threadId: string;
      try {
        await start(input.cwd);
        const conn = rpc!;
        threadId = "";
        if (input.sessionId) {
          try {
            const res = await conn.request<{ thread: { id: string } }>("thread/resume", {
              threadId: input.sessionId,
              cwd: input.cwd,
              model,
              ...policy,
              excludeTurns: true,
            });
            threadId = res.thread.id;
          } catch {
            input.onEvent({ kind: "notice", text: "Codex couldn't resume the earlier conversation; this is a fresh thread." });
          }
        }
        if (!threadId) {
          const res = await conn.request<{ thread: { id: string } }>("thread/start", { cwd: input.cwd, model, ...policy });
          threadId = res.thread.id;
        }
        input.onSession(threadId);
      } catch (err) {
        input.onEvent({ kind: "error", message: `Codex failed to start: ${err instanceof Error ? err.message : String(err)}` });
        return;
      }

      const conn = rpc!;
      const started = Date.now();
      let resolveTurn!: (t: Turn) => void;
      const finished = new Promise<Turn>((r) => (resolveTurn = r));
      const state: TurnState = { input, threadId, turnId: null, deltas: new Map(), usage: null, retrying: new Set(), done: resolveTurn };
      turns.set(threadId, state);
      const onAbort = () => {
        if (state.turnId) void conn.request("turn/interrupt", { threadId, turnId: state.turnId }).catch(() => {});
      };
      input.signal.addEventListener("abort", onAbort, { once: true });
      try {
        const res = await conn.request<{ turn: Turn }>("turn/start", {
          threadId,
          input: [{ type: "text", text: input.prompt, text_elements: [] }],
          model,
          approvalPolicy: policy.approvalPolicy,
        });
        state.turnId ??= res.turn.id;
        if (input.signal.aborted) onAbort();
        const turn = await finished;
        for (const text of state.deltas.values()) if (text.trim()) input.onEvent({ kind: "assistant-text", text });
        if (turn.status === "interrupted") input.onEvent({ kind: "notice", text: "Stopped." });
        else if (turn.status === "failed") input.onEvent({ kind: "error", message: `Codex: ${turn.error?.message ?? "the turn failed."}` });
        input.onEvent({
          kind: "turn-end",
          costUsd: null,
          inputTokens: state.usage?.inputTokens ?? 0,
          outputTokens: state.usage?.outputTokens ?? 0,
          durationMs: turn.durationMs ?? Date.now() - started,
        });
      } catch (err) {
        input.onEvent({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        input.signal.removeEventListener("abort", onAbort);
        turns.delete(threadId);
      }
    },
    dispose() {
      rpc?.close();
      rpc = null;
      ready = null;
    },
  };
}

function toolFor(item: ThreadItem): { name: string; summary: string } | null {
  switch (item.type) {
    case "commandExecution":
      return { name: "Run", summary: (item as { command: string }).command };
    case "fileChange":
      return { name: "Edit", summary: (item as { changes: { path: string }[] }).changes.map((c) => c.path).join(", ") };
    case "mcpToolCall": {
      const m = item as { server: string; tool: string };
      return { name: `${m.server} · ${m.tool}`, summary: "" };
    }
    case "webSearch":
      return { name: "Search", summary: (item as { query?: string }).query ?? "" };
    default:
      return null;
  }
}
