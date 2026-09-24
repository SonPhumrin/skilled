// A tiny stand-in for `codex app-server` for tests. The prompt picks the scenario:
//   "tool" - asks approval for a command, then reports it
//   "slow" - streams until turn/interrupt
//   other  - replies "Hi, <prompt>" in two deltas
import { createInterface } from "node:readline";

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const notify = (method, params) => send({ method, params });
let nextId = 5000;
const waiting = new Map();
const ask = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    send({ id, method, params });
  });
const threads = new Set(["known-thread"]);
let interrupted = false;
let extraRoots = [];

createInterface({ input: process.stdin }).on("line", async (line) => {
  const msg = JSON.parse(line);
  if (msg.id !== undefined && !msg.method) {
    waiting.get(msg.id)?.(msg.result);
    waiting.delete(msg.id);
    return;
  }
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return send({ id, result: { userAgent: "mock" } });
    case "initialized":
      return;
    case "skills/extraRoots/set":
      extraRoots = params.extraRoots;
      return send({ id, result: {} });
    case "model/list":
      return send({ id, result: { data: [{ id: "gpt-mock", displayName: "GPT Mock", hidden: false }, { id: "hidden", displayName: "H", hidden: true }], nextCursor: null } });
    case "thread/start": {
      const tid = `thread-${threads.size}`;
      threads.add(tid);
      return send({ id, result: { thread: { id: tid } } });
    }
    case "thread/resume":
      if (!threads.has(params.threadId)) return send({ id, error: { code: -32600, message: "no such thread" } });
      return send({ id, result: { thread: { id: params.threadId } } });
    case "turn/interrupt":
      interrupted = true;
      return send({ id, result: {} });
    case "turn/start": {
      const threadId = params.threadId;
      const text = params.input.map((i) => i.text).join("");
      const turn = { id: "turn-1", status: "inProgress", error: null, durationMs: null, items: [] };
      send({ id, result: { turn } });
      notify("turn/started", { threadId, turn });
      interrupted = false;
      const done = (status) => notify("turn/completed", { threadId, turn: { ...turn, status, durationMs: 42 } });
      if (text === "roots") {
        notify("item/completed", { threadId, turnId: turn.id, item: { type: "agentMessage", id: "m", text: JSON.stringify(extraRoots) } });
        return done("completed");
      }
      if (text === "slow") {
        while (!interrupted) {
          notify("item/agentMessage/delta", { threadId, turnId: turn.id, itemId: "m1", delta: "." });
          await new Promise((r) => setTimeout(r, 20));
        }
        return done("interrupted");
      }
      if (text === "tool") {
        const item = { type: "commandExecution", id: "c1", command: "npm test", status: "inProgress", aggregatedOutput: null, exitCode: null };
        notify("item/started", { threadId, turnId: turn.id, item });
        const res = await ask("item/commandExecution/requestApproval", { threadId, turnId: turn.id, itemId: "c1", command: "npm test", startedAtMs: 0 });
        const ok = res.decision === "accept" || res.decision === "acceptForSession";
        notify("item/completed", { threadId, turnId: turn.id, item: { ...item, status: ok ? "completed" : "declined", aggregatedOutput: ok ? `3 passed (${res.decision})` : null, exitCode: ok ? 0 : null } });
      }
      notify("item/completed", { threadId, turnId: turn.id, item: { type: "reasoning", id: "r1", summary: ["Considering it."], content: [] } });
      notify("item/agentMessage/delta", { threadId, turnId: turn.id, itemId: "m2", delta: "Hi, " });
      notify("item/agentMessage/delta", { threadId, turnId: turn.id, itemId: "m2", delta: text });
      notify("item/completed", { threadId, turnId: turn.id, item: { type: "agentMessage", id: "m2", text: `Hi, ${text}` } });
      notify("thread/tokenUsage/updated", { threadId, turnId: turn.id, tokenUsage: { last: { inputTokens: 900, cachedInputTokens: 0, outputTokens: 12, totalTokens: 912, reasoningOutputTokens: 0, cacheWriteInputTokens: 0 }, total: {}, modelContextWindow: null } });
      return done("completed");
    }
    default:
      if (id !== undefined) send({ id, error: { code: -32601, message: `no ${method}` } });
  }
});
