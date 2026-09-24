import { randomUUID } from "node:crypto";
import type {
  DiffFile,
  LiveUpdate,
  ModelOption,
  PermissionDecision,
  SendRequest,
  SkillEntry,
  StoredEvent,
  Thread,
  ThreadEvent,
} from "../shared/types";
import type { AgentDriver, HarnessTool } from "./agents/types";
import type { Store } from "./db";
import { workingTreeDiff } from "./git";
import type { Catalog } from "./skills/catalog";
import { composePrompt } from "./skills/compose";

/**
 * Everything the UI can ask for, with no Electron in sight, so it runs
 * under plain Node in tests. index.ts wires it to IPC.
 */
export class Service {
  private running = new Map<string, AbortController>();
  private pendingPermissions = new Map<string, (d: PermissionDecision) => void>();

  constructor(
    private store: Store,
    private catalog: Catalog,
    private driver: AgentDriver,
    private broadcast: (update: LiveUpdate) => void,
    /** Tools the harness offers the agent this turn (the browser pane's, once it's open). */
    private harnessTools: () => HarnessTool[] = () => [],
  ) {}

  listSkills(): SkillEntry[] {
    // Only user-invoked skills belong in the / menu; the agent finds the
    // model-invoked ones on its own.
    return this.catalog.userSkills;
  }

  listModels(): ModelOption[] {
    return this.driver.models();
  }

  createThread(projectId: string): Thread {
    this.store.getProject(projectId);
    return this.store.createThread(projectId, this.driver.defaultModel, "ask");
  }

  isRunning(threadId: string): boolean {
    return this.running.has(threadId);
  }

  private emit(threadId: string, event: ThreadEvent): StoredEvent {
    const stored = this.store.appendEvent(threadId, event);
    this.broadcast({ type: "event", threadId, stored });
    return stored;
  }

  async send(req: SendRequest): Promise<void> {
    if (this.running.has(req.threadId)) throw new Error("This thread is already running.");
    const thread = this.store.getThread(req.threadId);
    const project = this.store.getProject(thread.projectId);
    const prompt = composePrompt(this.catalog, req.text, req.skill);

    this.emit(thread.id, { kind: "user", text: req.text, skill: req.skill });
    if (thread.title === "New thread") {
      const title = titleFrom(req.text, req.skill);
      this.broadcast({ type: "thread", thread: this.store.updateThread(thread.id, { title }) });
    }

    const controller = new AbortController();
    this.running.set(thread.id, controller);
    this.broadcast({ type: "running", threadId: thread.id, running: true });
    try {
      await this.driver.runTurn({
        cwd: project.path,
        prompt,
        sessionId: thread.sessionId,
        model: thread.model,
        permissionMode: thread.permissionMode,
        signal: controller.signal,
        tools: this.harnessTools(),
        onEvent: (event) => this.emit(thread.id, event),
        onTextDelta: (text) => this.broadcast({ type: "text-delta", threadId: thread.id, text }),
        onSession: (sessionId) => {
          if (sessionId !== this.store.getThread(thread.id).sessionId) {
            this.broadcast({ type: "thread", thread: this.store.updateThread(thread.id, { sessionId }) });
          }
        },
        requestPermission: (p) =>
          new Promise<PermissionDecision>((resolve) => {
            const requestId = randomUUID();
            const done = (d: PermissionDecision) => {
              this.pendingPermissions.delete(requestId);
              resolve(d);
            };
            this.pendingPermissions.set(requestId, done);
            controller.signal.addEventListener("abort", () => done("deny"), { once: true });
            this.broadcast({ type: "permission", request: { requestId, threadId: thread.id, ...p } });
          }),
      });
    } finally {
      this.running.delete(thread.id);
      this.broadcast({ type: "running", threadId: thread.id, running: false });
      this.broadcast({ type: "thread", thread: this.store.updateThread(thread.id, {}) });
    }
  }

  interrupt(threadId: string): void {
    this.running.get(threadId)?.abort();
  }

  respondPermission(requestId: string, decision: PermissionDecision): void {
    this.pendingPermissions.get(requestId)?.(decision);
  }

  getDiff(projectId: string): Promise<DiffFile[]> {
    return workingTreeDiff(this.store.getProject(projectId).path);
  }
}

export function titleFrom(text: string, skill?: string): string {
  const firstLine = text.trim().split("\n")[0] ?? "";
  const base = firstLine || (skill ? `/${skill}` : "New thread");
  const withSkill = skill && firstLine ? `/${skill} ${firstLine}` : base;
  return withSkill.length > 60 ? `${withSkill.slice(0, 59)}…` : withSkill;
}
