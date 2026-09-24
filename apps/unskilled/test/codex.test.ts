import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PermissionDecision, ThreadEvent } from "../src/shared/types";
import { codexDecision, codexPolicy, createCodexDriver } from "../src/main/agents/codex";
import type { TurnInput } from "../src/main/agents/types";
import { closeAfter } from "./helpers";

const MOCK = join(__dirname, "fixtures", "mock-codex-app-server.mjs");

function driver() {
  const d = createCodexDriver({ command: process.execPath, args: [MOCK], clientVersion: "test", skillsDir: () => "/skills/here" });
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
    threadId: "t",
    cwd: tmpdir(),
    prompt,
    sessionId: null,
    model: "default",
    permissionMode: "ask",
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

describe("Codex driver", () => {
  it("runs a turn: reasoning, streamed reply, usage", async () => {
    const d = driver();
    const t = turn("there");
    await d.runTurn(t.input);
    expect(t.sessions).toEqual(["thread-1"]);
    expect(t.deltas.join("")).toBe("Hi, there");
    expect(t.events.map((e) => e.kind)).toEqual(["thinking", "assistant-text", "turn-end"]);
    expect(t.events.at(-1)).toMatchObject({ inputTokens: 900, outputTokens: 12, durationMs: 42 });
    expect(d.models().map((m) => m.id)).toEqual(["default", "gpt-mock"]);
  });

  it("registers skilled's skills as an extra skills root", async () => {
    const d = driver();
    const t = turn("roots");
    await d.runTurn(t.input);
    expect(t.events[0]).toMatchObject({ kind: "assistant-text", text: '["/skills/here"]' });
  });

  it("resumes a known thread and starts fresh for an unknown one", async () => {
    const d = driver();
    const known = turn("a", { sessionId: "known-thread" });
    await d.runTurn(known.input);
    expect(known.sessions).toEqual(["known-thread"]);
    const unknown = turn("b", { sessionId: "gone" });
    await d.runTurn(unknown.input);
    expect(unknown.events[0]).toMatchObject({ kind: "notice" });
    expect(unknown.sessions[0]).toMatch(/^thread-/);
  });

  it("asks before running a command and reports its output", async () => {
    const d = driver();
    const t = turn("tool");
    await d.runTurn(t.input);
    expect(t.asked).toEqual(["npm test"]);
    expect(t.events.slice(0, 2)).toEqual([
      { kind: "tool-use", toolUseId: "c1", name: "Run", summary: "npm test" },
      { kind: "tool-result", toolUseId: "c1", isError: false, summary: "3 passed (accept)" },
    ]);
  });

  it("interrupts a running turn", async () => {
    const d = driver();
    const t = turn("slow");
    const running = d.runTurn(t.input);
    await new Promise((r) => setTimeout(r, 200));
    t.controller.abort();
    await running;
    expect(t.events.some((e) => e.kind === "notice" && e.text === "Stopped.")).toBe(true);
  });
});

describe("Codex policy mapping", () => {
  it("maps permission modes and decisions", () => {
    expect(codexPolicy("ask")).toEqual({ approvalPolicy: "untrusted", sandbox: "workspace-write" });
    expect(codexPolicy("auto-edit")).toEqual({ approvalPolicy: "on-request", sandbox: "workspace-write" });
    expect(codexPolicy("full")).toEqual({ approvalPolicy: "never", sandbox: "danger-full-access" });
    expect(codexDecision("allow-always")).toBe("acceptForSession");
    expect(codexDecision("deny")).toBe("decline");
  });
});
