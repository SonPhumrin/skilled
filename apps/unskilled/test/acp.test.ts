import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PermissionDecision, PermissionMode, ThreadEvent } from "../src/shared/types";
import { createAcpDriver, optionFor, pickPermission } from "../src/main/agents/acp/driver";
import { loadAcpAgents, onPath } from "../src/main/agents/registry";
import type { TurnInput } from "../src/main/agents/types";
import { closeAfter, tempDir } from "./helpers";

const MOCK = join(__dirname, "fixtures", "mock-acp-agent.mjs");

function driver() {
  const d = createAcpDriver({ id: "mock", label: "Mock", command: process.execPath, args: [MOCK] }, { clientVersion: "test" });
  closeAfter(() => d.dispose?.());
  return d;
}

function turn(prompt: string, over: Partial<TurnInput> = {}) {
  const events: ThreadEvent[] = [];
  const deltas: string[] = [];
  const sessions: string[] = [];
  const asked: string[] = [];
  const controller = new AbortController();
  const input: TurnInput = {
    threadId: "thread-1",
    cwd: tempDir(),
    prompt,
    sessionId: null,
    model: "default",
    permissionMode: "ask" as PermissionMode,
    signal: controller.signal,
    tools: [],
    onEvent: (e) => events.push(e),
    onTextDelta: (t) => deltas.push(t),
    onSession: (s) => sessions.push(s),
    requestPermission: async (r) => {
      asked.push(r.summary);
      return "allow-once" as PermissionDecision;
    },
    ...over,
  };
  return { input, events, deltas, sessions, asked, controller };
}

describe("ACP driver", () => {
  it("streams a reply and reports the turn", async () => {
    const d = driver();
    const t = turn("world");
    await d.runTurn(t.input);
    expect(t.sessions).toEqual(["s-1"]);
    expect(t.deltas.join("")).toBe("Hello, world (mock-small)");
    expect(t.events.map((e) => e.kind)).toEqual(["thinking", "assistant-text", "turn-end"]);
    expect(t.events.at(-1)).toMatchObject({ kind: "turn-end", costUsd: 0.01, inputTokens: 1200, outputTokens: 34 });
  });

  it("keeps the agent and session between turns, and switches models", async () => {
    const d = driver();
    const first = turn("one");
    await d.runTurn(first.input);
    expect(d.models().map((m) => m.id)).toEqual(["default", "mock-small", "mock-large"]);
    const second = turn("two", { sessionId: first.sessions[0]!, model: "mock-large" });
    await d.runTurn(second.input);
    expect(second.sessions).toEqual(["s-1"]);
    expect(second.deltas.join("")).toBe("Hello, two (mock-large)");
  });

  it("resumes a stored session in a new agent process", async () => {
    const d = driver();
    const t = turn("again", { sessionId: "resumable-session" });
    await d.runTurn(t.input);
    expect(t.sessions).toEqual(["resumable-session"]);
    expect(t.events.some((e) => e.kind === "notice")).toBe(false);
  });

  it("starts fresh, and says so, when the session can't be resumed", async () => {
    const d = driver();
    const t = turn("hi", { sessionId: "gone" });
    await d.runTurn(t.input);
    expect(t.sessions).toEqual(["s-1"]);
    expect(t.events[0]).toMatchObject({ kind: "notice" });
  });

  it("routes tool permission to the user in Ask mode", async () => {
    const d = driver();
    const t = turn("tool");
    await d.runTurn(t.input);
    expect(t.asked).toEqual(["npm test"]);
    const kinds = t.events.map((e) => e.kind);
    expect(kinds).toEqual(["thinking", "assistant-text", "tool-use", "tool-result", "assistant-text", "turn-end"]);
    expect(t.events[3]).toMatchObject({ kind: "tool-result", isError: false, summary: "3 passed (yes)" });
  });

  it("denies when the user denies, and runs without asking in Full mode", async () => {
    const d = driver();
    const denied = turn("tool", { requestPermission: async () => "deny" });
    await d.runTurn(denied.input);
    expect(denied.events.find((e) => e.kind === "tool-result")).toMatchObject({ isError: true });

    const full = turn("tool", { permissionMode: "full", threadId: "thread-2" });
    await d.runTurn(full.input);
    expect(full.asked).toEqual([]);
    expect(full.events.find((e) => e.kind === "tool-result")).toMatchObject({ isError: false });
  });

  it("cancels a running turn", async () => {
    const d = driver();
    const t = turn("slow");
    const running = d.runTurn(t.input);
    await new Promise((r) => setTimeout(r, 150));
    t.controller.abort();
    await running;
    expect(t.events.some((e) => e.kind === "notice" && e.text === "Stopped.")).toBe(true);
  });

  it("reports an agent that can't start", async () => {
    const d = createAcpDriver({ id: "x", label: "Nope", command: "definitely-not-a-real-agent-binary", args: [] }, { clientVersion: "t" });
    const t = turn("hi");
    await d.runTurn(t.input);
    expect(t.events[0]).toMatchObject({ kind: "error" });
    expect((t.events[0] as { message: string }).message).toMatch(/Nope failed to start/);
  });
});

describe("permission mapping", () => {
  it("asks, allows edits, or allows everything by mode", () => {
    expect(pickPermission("ask", "edit")).toBe("ask");
    expect(pickPermission("auto-edit", "edit")).toBe("allow");
    expect(pickPermission("auto-edit", "execute")).toBe("ask");
    expect(pickPermission("full", "execute")).toBe("allow");
  });

  it("maps decisions onto the agent's options", () => {
    const opts = [
      { optionId: "a", name: "", kind: "allow_once" as const },
      { optionId: "r", name: "", kind: "reject_once" as const },
    ];
    expect(optionFor(opts, "allow-once")).toBe("a");
    expect(optionFor(opts, "allow-always")).toBe("a"); // falls back
    expect(optionFor(opts, "deny")).toBe("r");
  });
});

describe("agent registry", () => {
  it("offers installed presets plus agents.json entries", () => {
    const dir = tempDir();
    const file = join(dir, "agents.json");
    writeFileSync(file, JSON.stringify({ agents: [{ id: "gemini", label: "Gemini", command: "gemini", args: ["--experimental-acp"] }, { id: "bad" }] }));
    const { agents, problems } = loadAcpAgents(file, (cmd) => cmd === "dsh");
    expect(agents.map((a) => a.id)).toEqual(["deepseek", "gemini"]);
    expect(agents[0]).toMatchObject({ skillsDirEnv: "DSH_BUNDLED_SKILL_DIR" });
    expect(problems).toHaveLength(1);
  });

  it("finds commands on PATH", () => {
    const dir = tempDir();
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const name = process.platform === "win32" ? "fake-agent.cmd" : "fake-agent";
    writeFileSync(join(bin, name), "", { mode: 0o755 });
    expect(onPath("fake-agent", { PATH: bin, PATHEXT: ".CMD" })).toBe(true);
    expect(onPath("missing-agent", { PATH: bin, PATHEXT: ".CMD" })).toBe(false);
  });
});
