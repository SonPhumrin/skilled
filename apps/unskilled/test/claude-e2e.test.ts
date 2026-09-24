import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ThreadEvent } from "../src/shared/types";
import { createClaudeDriver } from "../src/main/agents/claude";
import type { LimitsPatch } from "../src/main/agents/limits";
import { ensurePlugin } from "../src/main/skills/plugin";
import { catalog, closeAfter } from "./helpers";

// The real Claude Code binary (the Agent SDK's platform package) against a
// fake Messages API, so a whole turn runs without an account. The fake sends
// the unified rate-limit headers a claude.ai plan gets, to check they arrive
// as limits without any request of their own.
function fakeAnthropic() {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push(`${req.method} ${req.url?.split("?")[0]}`);
      if (!req.url?.startsWith("/v1/messages")) return void res.writeHead(404, { "content-type": "application/json" }).end("{}");
      const { model, stream } = JSON.parse(body) as { model: string; stream?: boolean };
      const usage = { input_tokens: 10, output_tokens: 3 };
      if (!stream) {
        res.writeHead(200, { "content-type": "application/json" });
        return void res.end(JSON.stringify({ id: "m0", type: "message", role: "assistant", model, content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage }));
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "anthropic-ratelimit-unified-status": "allowed_warning",
        "anthropic-ratelimit-unified-representative-claim": "five_hour",
        "anthropic-ratelimit-unified-reset": "1790000000",
        "anthropic-ratelimit-unified-5h-utilization": "0.84",
        "anthropic-ratelimit-unified-5h-reset": "1790000000",
        "anthropic-ratelimit-unified-5h-surpassed-threshold": "0.8",
        "anthropic-ratelimit-unified-7d-utilization": "0.41",
        "anthropic-ratelimit-unified-7d-reset": "1790500000",
      });
      const ev = (e: object) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`;
      res.end(
        ev({ type: "message_start", message: { id: "m1", type: "message", role: "assistant", model, content: [], stop_reason: null, usage: { ...usage, output_tokens: 1 } } }) +
          ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
          ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello." } }) +
          ev({ type: "content_block_stop", index: 0 }) +
          ev({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }) +
          ev({ type: "message_stop" }),
      );
    });
  });
  return { server, requests };
}

function setEnv(vars: Record<string, string>) {
  const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  closeAfter(() => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

describe("Claude end to end (real Claude Code, fake API)", () => {
  it("runs a turn and reports plan limits from the response headers", async () => {
    const { server, requests } = fakeAnthropic();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    closeAfter(() => void server.close());
    // The driver's agent inherits process.env; a scratch config dir keeps the user's settings out.
    setEnv({
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      ANTHROPIC_API_KEY: "sk-ant-test",
      CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), "unskilled-claude-config-")),
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    });

    const limits: LimitsPatch[] = [];
    const pluginRoot = mkdtempSync(join(tmpdir(), "unskilled-plugin-"));
    const driver = createClaudeDriver({
      pluginDir: () => ensurePlugin(catalog(), join(pluginRoot, "skilled-plugin")),
      guardScript: join(__dirname, "missing-guard.py"), // Bash never runs in this turn
      onLimits: (p) => limits.push(p),
    });
    const events: ThreadEvent[] = [];
    let text = "";
    await driver.runTurn({
      threadId: "t",
      cwd: mkdtempSync(join(tmpdir(), "unskilled-claude-cwd-")),
      prompt: "hi",
      sessionId: null,
      model: "claude-sonnet-5",
      permissionMode: "ask",
      signal: new AbortController().signal,
      tools: [],
      onEvent: (e) => events.push(e),
      onTextDelta: (d) => (text += d),
      onSession: () => {},
      requestPermission: async () => "deny",
    });

    expect(events.filter((e) => e.kind === "error")).toEqual([]);
    expect(text).toBe("Hello.");
    expect(events.find((e) => e.kind === "assistant-text")).toMatchObject({ text: "Hello." });
    expect(events.at(-1)).toMatchObject({ kind: "turn-end", outputTokens: 3 });
    expect(limits).toContainEqual({
      windows: [
        { id: "five_hour", label: "5-hour", usedPercent: 84, resetsAt: 1_790_000_000_000 },
        { id: "seven_day", label: "Weekly", usedPercent: 41, resetsAt: 1_790_500_000_000 },
      ],
      state: "warning",
    });
    // Only the turn's own model calls: no usage endpoint, no polling.
    expect(requests.every((r) => r === "POST /v1/messages" || r.startsWith("GET /v1/code/"))).toBe(true);
  }, 90_000);
});
