import type { LiveUpdate, Project, SkillEntry, StoredEvent, Thread, ThreadEvent, UnskilledApi } from "../../shared/types";

/**
 * A fake backend for `npm run preview:ui`: the real renderer in a plain
 * browser, with canned data, so the UI can be looked at and screenshotted
 * without Electron or an agent. `?state=` picks a scene.
 */
export function installMock(): void {
  const params = new URLSearchParams(location.search);
  const scene = params.get("state") ?? "thread";
  const now = Date.now();
  const listeners = new Set<(u: LiveUpdate) => void>();
  const emit = (u: LiveUpdate) => listeners.forEach((l) => l(u));

  const projects: Project[] =
    scene === "welcome"
      ? []
      : [
          { id: "p1", path: "/Users/you/code/acme-web", name: "acme-web", createdAt: now },
          { id: "p2", path: "/Users/you/code/billing-service", name: "billing-service", createdAt: now },
        ];
  const t = (id: string, projectId: string, title: string, ago: number): Thread => ({
    id,
    projectId,
    agent: "claude",
    title,
    sessionId: "s-" + id,
    model: "claude-opus-5",
    permissionMode: "ask",
    createdAt: now - ago,
    updatedAt: now - ago,
  });
  const threads: Record<string, Thread[]> = {
    p1:
      scene === "project"
        ? []
        : [
            t("t1", "p1", "Add rate limiting to the login endpoint", 60_000),
            t("t2", "p1", "/domain-interview checkout redesign", 3_600_000),
            t("t3", "p1", "Why is the settings page slow?", 86_400_000),
          ],
    p2: [t("t4", "p2", "/implement ticket 03: invoice PDFs", 7_200_000)],
  };

  const ev = (seq: number, event: ThreadEvent): StoredEvent => ({ seq, event, createdAt: now });
  const events: Record<string, StoredEvent[]> = {
    t1: [
      ev(1, { kind: "user", text: "Add rate limiting to the login endpoint: 5 attempts per minute per IP, then 429." }),
      ev(2, {
        kind: "assistant-text",
        text: "I'll look at how requests reach the login handler first, then add the limiter at the **highest seam**: the route middleware, so the handler itself stays untouched.",
      }),
      ev(3, { kind: "tool-use", toolUseId: "u1", name: "Grep", summary: "router.post\\(\"/login\"" }),
      ev(4, { kind: "tool-result", toolUseId: "u1", isError: false, summary: "src/routes/auth.ts:42" }),
      ev(5, { kind: "tool-use", toolUseId: "u2", name: "Read", summary: "src/routes/auth.ts" }),
      ev(6, { kind: "tool-result", toolUseId: "u2", isError: false, summary: "118 lines" }),
      ev(7, { kind: "tool-use", toolUseId: "u3", name: "Skill", summary: "skilled:tdd" }),
      ev(8, { kind: "tool-result", toolUseId: "u3", isError: false, summary: "Loaded" }),
      ev(9, { kind: "tool-use", toolUseId: "u4", name: "Write", summary: "src/middleware/rateLimit.test.ts" }),
      ev(10, { kind: "tool-result", toolUseId: "u4", isError: false, summary: "Created" }),
      ev(11, { kind: "tool-use", toolUseId: "u5", name: "Bash", summary: "npm test -- rateLimit" }),
      ev(12, { kind: "tool-result", toolUseId: "u5", isError: true, summary: "1 failing: returns 429 after 5 attempts" }),
      ev(13, { kind: "tool-use", toolUseId: "u6", name: "Edit", summary: "src/middleware/rateLimit.ts" }),
      ev(14, { kind: "tool-result", toolUseId: "u6", isError: false, summary: "Updated" }),
      ev(15, { kind: "tool-use", toolUseId: "u7", name: "Bash", summary: "npm test -- rateLimit" }),
      ev(16, { kind: "tool-result", toolUseId: "u7", isError: false, summary: "3 passed" }),
      ev(17, {
        kind: "assistant-text",
        text: [
          "Done. The limiter is a small middleware keyed by client IP:",
          "",
          "```ts",
          "export const loginLimiter = rateLimit({ windowMs: 60_000, max: 5 });",
          'router.post("/login", loginLimiter, login);',
          "```",
          "",
          "- The 6th attempt inside a minute gets `429 Too Many Requests` with a `Retry-After` header.",
          "- Tests cover the limit, the reset after the window, and separate IPs.",
          "",
          "One open question: behind your load balancer, `req.ip` is the proxy's address unless `trust proxy` is set. Want me to set it?",
        ].join("\n"),
      }),
      ev(18, { kind: "turn-end", costUsd: 0.184, inputTokens: 48_200, outputTokens: 2_150, durationMs: 41_300 }),
    ],
  };

  const skills: SkillEntry[] = [
    ["skilled", "Which skill fits your situation. A router over everything in the skilled set."],
    ["skilled-setup", "Configure a repo: issue tracker, triage labels, domain docs. Once per repo."],
    ["domain-interview", "A relentless interview to sharpen a plan or design, which also creates docs."],
    ["clarify-requirements", "A relentless interview to sharpen a plan or design before any code is written."],
    ["design-doc", "Research and write a pre-spec architecture doc, for work big enough to need one."],
    ["write-spec", "Turn the current conversation into a spec and publish it to the issue tracker."],
    ["write-tickets", "Break a plan, spec, or the conversation into tracer-bullet tickets."],
    ["implement", "Build the work described by a spec or tickets, test-first at agreed seams."],
    ["implement-spec", "Implement a whole spec on one branch, one PR."],
    ["triage", "Move issues through the triage state machine."],
    ["handoff", "Compact this conversation into a handoff document."],
    ["retro", "Review a finished session and propose fixes to the agent environment."],
  ].map(([name, description]) => ({
    name: name!,
    description: description!,
    invocation: "user" as const,
    calls: [],
    files: ["SKILL.md"],
    sha256: "",
  }));

  const api: UnskilledApi = {
    platform: params.get("platform") ?? "darwin",
    listProjects: async () => projects,
    addProject: async () => null,
    listThreads: async (pid) => threads[pid] ?? [],
    createThread: async (pid) => {
      const th = t(`t${Math.random()}`, pid, "New thread", 0);
      threads[pid] = [th, ...(threads[pid] ?? [])];
      return th;
    },
    updateThread: async (id, patch) => {
      for (const list of Object.values(threads)) {
        const i = list.findIndex((x) => x.id === id);
        if (i >= 0) return (list[i] = { ...list[i]!, ...patch, updatedAt: Date.now() });
      }
      throw new Error("no thread");
    },
    deleteThread: async () => {},
    listEvents: async (id) => events[id] ?? [],
    listSkills: async () => skills,
    listAgents: async () => [
      {
        id: "claude",
        label: "Claude",
        defaultModel: "claude-opus-5",
        models: [
          { id: "claude-opus-5", label: "Opus 5" },
          { id: "claude-sonnet-5", label: "Sonnet 5" },
          { id: "claude-haiku-4-5", label: "Haiku 4.5" },
        ],
      },
      {
        id: "deepseek",
        label: "DeepSeek",
        defaultModel: "default",
        models: [
          { id: "default", label: "Agent default" },
          { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
          { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
        ],
      },
    ],
    send: async () => {},
    interrupt: async () => {},
    respondPermission: async () => {},
    browserAttached: async () => {},
    browserPick: async () => {},
    getDiff: async () => [
      {
        path: "src/middleware/rateLimit.ts",
        status: "untracked",
        additions: 9,
        deletions: 0,
        hunks: [
          {
            header: "@@ new file @@",
            lines: [
              'import rateLimit from "express-rate-limit";',
              "",
              "export const loginLimiter = rateLimit({",
              "  windowMs: 60_000,",
              "  max: 5,",
              "  standardHeaders: true,",
              '  message: { error: "Too many login attempts. Try again in a minute." },',
              "});",
              "",
            ].map((text) => ({ kind: "add" as const, text })),
          },
        ],
      },
      {
        path: "src/routes/auth.ts",
        status: "modified",
        additions: 2,
        deletions: 1,
        hunks: [
          {
            header: "@@ -39,7 +39,8 @@ export function authRoutes(router: Router) {",
            lines: [
              { kind: "context", text: "  const login = makeLogin(users, sessions);" },
              { kind: "add", text: '  import { loginLimiter } from "../middleware/rateLimit";' },
              { kind: "del", text: '  router.post("/login", login);' },
              { kind: "add", text: '  router.post("/login", loginLimiter, login);' },
              { kind: "context", text: '  router.post("/logout", logout);' },
            ],
          },
        ],
      },
    ],
    onUpdate: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  window.unskilled = api;

  // Scenes that need live state once the app has subscribed.
  setTimeout(() => {
    if (scene === "running" || scene === "permission") {
      emit({ type: "running", threadId: "t1", running: true });
      emit({ type: "text-delta", threadId: "t1", text: "Setting `trust proxy` so the limiter sees the real client IP. I'll check how the app is" });
    }
    if (scene === "permission") {
      emit({ type: "text-delta", threadId: "t1", text: "" });
      emit({
        type: "permission",
        request: { requestId: "r1", threadId: "t1", toolName: "Bash", summary: "npm install express-rate-limit@7", canAlwaysAllow: true },
      });
    }
  }, 300);
}
