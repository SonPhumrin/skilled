import { create } from "zustand";
import type {
  LiveUpdate,
  ModelOption,
  PermissionRequest,
  Project,
  SkillEntry,
  StoredEvent,
  Thread,
} from "../../shared/types";
import { api } from "./api";

interface State {
  projects: Project[];
  threads: Record<string, Thread[]>; // by project id
  skills: SkillEntry[];
  models: ModelOption[];
  selectedProjectId: string | null;
  selectedThreadId: string | null;
  events: Record<string, StoredEvent[]>; // by thread id
  liveText: Record<string, string>; // streaming text not yet stored
  running: Record<string, boolean>;
  permissions: PermissionRequest[];
  inspectorOpen: boolean;
  inspectorTab: "changes" | "browser";
  /** The browser pane has been shown this session, so its <webview> stays mounted. */
  browserMounted: boolean;
  /** A URL for the browser pane to load. */
  browserUrl: string | null;
  /** A skill to pre-fill in the composer, set by the empty-state shortcuts. */
  pendingSkill: string | null;
  diffVersion: number; // bumps when a turn ends, so the diff refreshes

  init(): Promise<void>;
  addProject(): Promise<void>;
  selectProject(id: string): Promise<void>;
  selectThread(id: string | null): Promise<void>;
  newThread(skill?: string): Promise<void>;
  takePendingSkill(): string | null;
  updateThread(patch: Partial<Pick<Thread, "title" | "model" | "permissionMode">>): Promise<void>;
  send(text: string, skill?: string): Promise<void>;
  interrupt(): Promise<void>;
  respond(requestId: string, decision: "allow-once" | "allow-always" | "deny"): Promise<void>;
  toggleInspector(): void;
  showInspector(tab: "changes" | "browser"): void;
  apply(update: LiveUpdate): void;
}

function upsertThread(list: Thread[] | undefined, thread: Thread): Thread[] {
  const rest = (list ?? []).filter((t) => t.id !== thread.id);
  return [thread, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
}

let initialized = false;

export const useStore = create<State>((set, get) => ({
  projects: [],
  threads: {},
  skills: [],
  models: [],
  selectedProjectId: null,
  selectedThreadId: null,
  events: {},
  liveText: {},
  running: {},
  permissions: [],
  inspectorOpen: false,
  inspectorTab: "changes",
  browserMounted: false,
  browserUrl: null,
  pendingSkill: null,
  diffVersion: 0,

  async init() {
    // React StrictMode runs effects twice in development; subscribe once.
    if (initialized) return;
    initialized = true;
    // Subscribe before the first await, so no update sent during startup is lost.
    api().onUpdate((u) => get().apply(u));
    const [projects, skills, models] = await Promise.all([api().listProjects(), api().listSkills(), api().listModels()]);
    const threads: Record<string, Thread[]> = {};
    for (const p of projects) threads[p.id] = await api().listThreads(p.id);
    set({ projects, skills, models, threads });
    const first = projects[0];
    if (first) {
      await get().selectProject(first.id);
      const recent = threads[first.id]?.[0];
      if (recent) await get().selectThread(recent.id);
    }
  },

  async addProject() {
    const project = await api().addProject();
    if (!project) return;
    const threads = await api().listThreads(project.id);
    set((s) => ({
      projects: s.projects.some((p) => p.id === project.id)
        ? s.projects
        : [...s.projects, project].sort((a, b) => a.name.localeCompare(b.name)),
      threads: { ...s.threads, [project.id]: threads },
    }));
    await get().selectProject(project.id);
  },

  async selectProject(id) {
    set({ selectedProjectId: id });
    if (!get().threads[id]) {
      const list = await api().listThreads(id);
      set((s) => ({ threads: { ...s.threads, [id]: list } }));
    }
  },

  async selectThread(id) {
    set({ selectedThreadId: id });
    if (id && !get().events[id]) {
      const events = await api().listEvents(id);
      set((s) => ({ events: { ...s.events, [id]: events } }));
    }
  },

  async newThread(skill) {
    const projectId = get().selectedProjectId;
    if (!projectId) return;
    const thread = await api().createThread(projectId);
    set((s) => ({
      pendingSkill: skill ?? null,
      threads: { ...s.threads, [projectId]: upsertThread(s.threads[projectId], thread) },
      events: { ...s.events, [thread.id]: [] },
      selectedThreadId: thread.id,
    }));
  },

  takePendingSkill() {
    const skill = get().pendingSkill;
    if (skill) set({ pendingSkill: null });
    return skill;
  },

  async updateThread(patch) {
    const id = get().selectedThreadId;
    if (!id) return;
    const thread = await api().updateThread(id, patch);
    get().apply({ type: "thread", thread });
  },

  async send(text, skill) {
    const id = get().selectedThreadId;
    if (!id || get().running[id]) return;
    set((s) => ({ running: { ...s.running, [id]: true } }));
    await api().send({ threadId: id, text, skill });
  },

  async interrupt() {
    const id = get().selectedThreadId;
    if (id) await api().interrupt(id);
  },

  async respond(requestId, decision) {
    set((s) => ({ permissions: s.permissions.filter((p) => p.requestId !== requestId) }));
    await api().respondPermission(requestId, decision);
  },

  toggleInspector() {
    set((s) => ({ inspectorOpen: !s.inspectorOpen }));
  },

  showInspector(tab) {
    set((s) => {
      // Clicking the open tab's button again closes the inspector.
      if (s.inspectorOpen && s.inspectorTab === tab) return { inspectorOpen: false };
      return { inspectorOpen: true, inspectorTab: tab, browserMounted: s.browserMounted || tab === "browser" };
    });
  },

  apply(update) {
    switch (update.type) {
      case "event":
        set((s) => {
          const list = s.events[update.threadId] ?? [];
          if (list.some((e) => e.seq === update.stored.seq)) return {};
          const clearLive = update.stored.event.kind !== "user";
          return {
            events: { ...s.events, [update.threadId]: [...list, update.stored] },
            liveText: clearLive ? { ...s.liveText, [update.threadId]: "" } : s.liveText,
          };
        });
        return;
      case "text-delta":
        set((s) => ({ liveText: { ...s.liveText, [update.threadId]: (s.liveText[update.threadId] ?? "") + update.text } }));
        return;
      case "running":
        set((s) => ({
          running: { ...s.running, [update.threadId]: update.running },
          liveText: update.running ? s.liveText : { ...s.liveText, [update.threadId]: "" },
          permissions: update.running ? s.permissions : s.permissions.filter((p) => p.threadId !== update.threadId),
          diffVersion: update.running ? s.diffVersion : s.diffVersion + 1,
        }));
        return;
      case "permission":
        set((s) =>
          s.permissions.some((p) => p.requestId === update.request.requestId)
            ? {}
            : { permissions: [...s.permissions, update.request] },
        );
        return;
      case "browser-open":
        set({ inspectorOpen: true, inspectorTab: "browser", browserMounted: true, browserUrl: update.url ?? null });
        return;
      case "thread":
        set((s) => ({
          threads: { ...s.threads, [update.thread.projectId]: upsertThread(s.threads[update.thread.projectId], update.thread) },
        }));
        return;
    }
  },
}));

export function useSelectedThread(): Thread | null {
  return useStore((s) => {
    if (!s.selectedProjectId || !s.selectedThreadId) return null;
    return s.threads[s.selectedProjectId]?.find((t) => t.id === s.selectedThreadId) ?? null;
  });
}
