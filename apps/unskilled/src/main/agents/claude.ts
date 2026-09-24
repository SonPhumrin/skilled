import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import type { HookCallback, Options, PermissionResult, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { McpServerEntry, ModelOption, PermissionMode } from "../../shared/types";
import { forClaude } from "../mcp/servers";
import { checkCommand } from "../guard";
import { PLUGIN_NAME } from "../skills/plugin";
import { claudeLimitsPatch, type LimitsListener } from "./limits";
import { summarizeToolInput, summarizeToolResult } from "./summarize";
import type { AgentDriver, HarnessTool, ToolOutput, TurnInput } from "./types";

/** MCP server name for harness tools: they reach Claude as mcp__unskilled__<tool>. */
export const TOOL_SERVER = "unskilled";

function toCallToolResult(out: ToolOutput) {
  const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [
    { type: "text", text: out.text },
  ];
  if (out.imagePng) content.push({ type: "image", data: out.imagePng, mimeType: "image/png" });
  return { content, isError: out.isError };
}

/** Harness tools as an in-process MCP server, plus the names to auto-allow. */
export function harnessToolOptions(tools: HarnessTool[]): Pick<Options, "mcpServers" | "allowedTools"> {
  if (!tools.length) return {};
  const server = createSdkMcpServer({
    name: TOOL_SERVER,
    version: "1.0.0",
    tools: tools.map((t) => tool(t.name, t.description, t.input, async (args) => toCallToolResult(await t.run(args)))),
  });
  return {
    mcpServers: { [TOOL_SERVER]: server },
    allowedTools: tools.filter((t) => t.autoAllow).map((t) => `mcp__${TOOL_SERVER}__${t.name}`),
  };
}

/** The user's MCP servers next to the harness's own; Claude also keeps the ones in its own config. */
function withUserServers(opts: Pick<Options, "mcpServers" | "allowedTools">, servers: McpServerEntry[]): Pick<Options, "mcpServers" | "allowedTools"> {
  if (!servers.length) return opts;
  return { ...opts, mcpServers: { ...(forClaude(servers) as NonNullable<Options["mcpServers"]>), ...opts.mcpServers } };
}

const MODELS: ModelOption[] = [
  { id: "claude-opus-5", label: "Opus 5" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
  { id: "claude-fable-5-1", label: "Fable 5.1" },
];

const SDK_MODE: Record<PermissionMode, Options["permissionMode"]> = {
  ask: "default",
  "auto-edit": "acceptEdits",
  full: "bypassPermissions",
};

/**
 * In a packaged app the SDK resolves its Claude Code binary to a path inside
 * app.asar, which can't be executed; electron-builder unpacks it beside the
 * archive (asarUnpack), so point the SDK there. Undefined in development,
 * where the SDK's own lookup works.
 */
export function resolvePackagedClaudeBinary(
  resolve: (id: string) => string = createRequire(import.meta.url).resolve,
  platform: string = process.platform,
  arch: string = process.arch,
): string | undefined {
  const exe = platform === "win32" ? "claude.exe" : "claude";
  const names =
    platform === "linux"
      ? [`claude-agent-sdk-linux-${arch}`, `claude-agent-sdk-linux-${arch}-musl`]
      : [`claude-agent-sdk-${platform}-${arch}`];
  for (const name of names) {
    let path: string;
    try {
      path = resolve(`@anthropic-ai/${name}/${exe}`);
    } catch {
      continue;
    }
    if (!/app\.asar[\\/]/.test(path)) return undefined;
    const unpacked = path.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
    if (existsSync(unpacked)) return unpacked;
  }
  return undefined;
}

export interface ClaudeDriverConfig {
  /** The generated plugin carrying skilled's model-invoked skills. */
  pluginDir: () => string;
  /** skilled's git-guardrails script. */
  guardScript: string;
  /** Plan rate limits, as Claude reports them during turns (claude.ai logins only). */
  onLimits?: LimitsListener;
}

/**
 * Claude through the Agent SDK: Claude Code's own loop and tools, with the
 * user's Claude Code settings, CLAUDE.md, and login. One `query()` per turn,
 * resuming the thread's session so the conversation carries over.
 */
export function createClaudeDriver(config: ClaudeDriverConfig): AgentDriver {
  return {
    id: "claude",
    label: "Claude",
    defaultModel: "claude-opus-5",
    skillCallPrefix: `${PLUGIN_NAME}:`,
    models: () => MODELS,
    async runTurn(input: TurnInput): Promise<void> {
      const abortController = new AbortController();
      input.signal.addEventListener("abort", () => abortController.abort(), { once: true });

      const guard: HookCallback = async (hookInput) => {
        if (hookInput.hook_event_name !== "PreToolUse") return {};
        const command = (hookInput.tool_input as { command?: unknown } | undefined)?.command;
        if (typeof command !== "string") return {};
        const verdict = await checkCommand(config.guardScript, hookInput.tool_name, command);
        if (!verdict.blocked) return {};
        input.onEvent({ kind: "notice", text: `Blocked by git guardrails: ${command}` });
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: verdict.reason,
          },
        };
      };

      const options: Options = {
        cwd: input.cwd,
        abortController,
        pathToClaudeCodeExecutable: resolvePackagedClaudeBinary(),
        model: input.model,
        resume: input.sessionId ?? undefined,
        permissionMode: SDK_MODE[input.permissionMode],
        allowDangerouslySkipPermissions: input.permissionMode === "full",
        includePartialMessages: true,
        plugins: [{ type: "local", path: config.pluginDir() }],
        ...withUserServers(harnessToolOptions(input.tools), input.mcpServers),
        hooks: { PreToolUse: [{ matcher: "Bash", hooks: [guard] }] },
        canUseTool: async (toolName, toolInput, { suggestions }): Promise<PermissionResult> => {
          const decision = await input.requestPermission({
            toolName,
            summary: summarizeToolInput(toolName, toolInput),
            canAlwaysAllow: Boolean(suggestions?.length),
          });
          if (decision === "deny") return { behavior: "deny", message: "The user declined this action." };
          return {
            behavior: "allow",
            updatedInput: toolInput,
            updatedPermissions: decision === "allow-always" ? suggestions : undefined,
          };
        },
      };

      try {
        for await (const message of query({ prompt: input.prompt, options })) {
          if (message.type === "rate_limit_event") config.onLimits?.(claudeLimitsPatch(message.rate_limit_info));
          else handleMessage(message, input);
        }
      } catch (err) {
        if (input.signal.aborted) {
          input.onEvent({ kind: "notice", text: "Stopped." });
          return;
        }
        input.onEvent({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

function handleMessage(message: SDKMessage, input: TurnInput): void {
  switch (message.type) {
    case "system":
      if (message.subtype === "init") input.onSession(message.session_id);
      return;
    case "stream_event": {
      if (message.parent_tool_use_id) return; // subagent chatter stays out of the main thread
      const ev = message.event;
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") input.onTextDelta(ev.delta.text);
      return;
    }
    case "assistant": {
      if (message.parent_tool_use_id) return;
      if (message.error) {
        input.onEvent({ kind: "error", message: describeError(message.error) });
      }
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) {
          input.onEvent({ kind: "assistant-text", text: block.text });
        } else if (block.type === "thinking" && block.thinking.trim()) {
          input.onEvent({ kind: "thinking", text: block.thinking });
        } else if (block.type === "tool_use") {
          input.onEvent({
            kind: "tool-use",
            toolUseId: block.id,
            name: block.name,
            summary: summarizeToolInput(block.name, (block.input ?? {}) as Record<string, unknown>),
          });
        }
      }
      return;
    }
    case "user": {
      if (message.parent_tool_use_id) return;
      const content = message.message.content;
      if (!Array.isArray(content)) return;
      for (const block of content) {
        if (block.type === "tool_result") {
          input.onEvent({
            kind: "tool-result",
            toolUseId: block.tool_use_id,
            isError: Boolean(block.is_error),
            summary: summarizeToolResult(block.content),
          });
        }
      }
      return;
    }
    case "result": {
      input.onEvent({
        kind: "turn-end",
        costUsd: typeof message.total_cost_usd === "number" ? message.total_cost_usd : null,
        inputTokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0),
        outputTokens: message.usage.output_tokens,
        durationMs: message.duration_ms,
      });
      if (message.subtype !== "success") {
        input.onEvent({ kind: "error", message: `The turn ended early (${message.subtype}).` });
      }
      return;
    }
    default:
      return;
  }
}

function describeError(code: string): string {
  switch (code) {
    case "authentication_failed":
      return "Claude isn't signed in. Run `claude` once in a terminal to log in, or set ANTHROPIC_API_KEY, then try again.";
    case "rate_limit":
      return "Rate limited. Wait a moment and send again.";
    case "overloaded":
      return "Claude is overloaded right now. Try again shortly.";
    default:
      return `Claude reported an error: ${code}.`;
  }
}
