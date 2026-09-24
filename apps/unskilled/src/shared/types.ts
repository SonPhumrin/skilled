// The contract between the main process and the renderer. Everything that
// crosses the preload bridge is one of these types.

export type Invocation = "model" | "user";

/** One entry of skilled's skills.json (see HARNESS.md at the repo root). */
export interface SkillEntry {
  name: string;
  description: string;
  invocation: Invocation;
  argumentHint?: string;
  compatibility?: string;
  calls: string[];
  files: string[];
  sha256: string;
}

export interface Project {
  id: string;
  path: string;
  name: string;
  createdAt: number;
}

export type PermissionMode = "ask" | "auto-edit" | "full";

export interface Thread {
  id: string;
  projectId: string;
  /** Which agent runs this thread: "claude", or an ACP agent's id. */
  agent: string;
  title: string;
  /** The agent's own session id, used to resume the conversation. */
  sessionId: string | null;
  model: string;
  permissionMode: PermissionMode;
  createdAt: number;
  updatedAt: number;
}

/**
 * What a thread shows, normalized across agents. Stored in order, one row
 * each; `text-delta` is live-only and never stored.
 */
export type ThreadEvent =
  | { kind: "user"; text: string; skill?: string }
  | { kind: "assistant-text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool-use"; toolUseId: string; name: string; summary: string }
  | { kind: "tool-result"; toolUseId: string; isError: boolean; summary: string }
  | { kind: "turn-end"; costUsd: number | null; inputTokens: number; outputTokens: number; durationMs: number }
  | { kind: "error"; message: string }
  | { kind: "notice"; text: string };

export interface StoredEvent {
  seq: number;
  event: ThreadEvent;
  createdAt: number;
}

/** A tool call waiting on the user in "ask" mode. */
export interface PermissionRequest {
  requestId: string;
  threadId: string;
  toolName: string;
  summary: string;
  canAlwaysAllow: boolean;
}

export type PermissionDecision = "allow-once" | "allow-always" | "deny";

export interface DiffLine {
  kind: "context" | "add" | "del";
  text: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface ModelOption {
  id: string;
  label: string;
}

export interface AgentInfo {
  id: string;
  label: string;
  models: ModelOption[];
  defaultModel: string;
}

export interface SendRequest {
  threadId: string;
  text: string;
  /** A user-invoked skill picked from the / menu. */
  skill?: string;
}

/** Pushed from main to renderer while a turn runs. */
export type LiveUpdate =
  | { type: "event"; threadId: string; stored: StoredEvent }
  | { type: "text-delta"; threadId: string; text: string }
  | { type: "running"; threadId: string; running: boolean }
  | { type: "permission"; request: PermissionRequest }
  | { type: "thread"; thread: Thread }
  /** The agent needs the browser pane: show it, optionally at a URL. */
  | { type: "browser-open"; url?: string }
  /** The user picked an element in the browser pane (null: cancelled). */
  | { type: "browser-picked"; text: string | null }
  | { type: "terminal-data"; id: string; data: string }
  | { type: "terminal-exit"; id: string; code: number };

/** The API the preload script exposes as `window.unskilled`. */
export interface UnskilledApi {
  platform: string;
  listProjects(): Promise<Project[]>;
  addProject(): Promise<Project | null>;
  listThreads(projectId: string): Promise<Thread[]>;
  createThread(projectId: string, agent?: string): Promise<Thread>;
  updateThread(threadId: string, patch: Partial<Pick<Thread, "title" | "model" | "permissionMode" | "agent">>): Promise<Thread>;
  deleteThread(threadId: string): Promise<void>;
  listEvents(threadId: string): Promise<StoredEvent[]>;
  listSkills(): Promise<SkillEntry[]>;
  listAgents(): Promise<AgentInfo[]>;
  send(request: SendRequest): Promise<void>;
  interrupt(threadId: string): Promise<void>;
  respondPermission(requestId: string, decision: PermissionDecision): Promise<void>;
  getDiff(projectId: string): Promise<DiffFile[]>;
  /** The browser pane's <webview> is ready; main takes control of it. */
  browserAttached(webContentsId: number): Promise<void>;
  /** Start picking an element in the browser pane. */
  browserPick(): Promise<void>;
  /** Open (or reattach to) the terminal with this id, in `cwd` (home when null). */
  terminalOpen(id: string, cwd: string | null, cols: number, rows: number): Promise<void>;
  terminalWrite(id: string, data: string): void;
  terminalResize(id: string, cols: number, rows: number): void;
  terminalClose(id: string): Promise<void>;
  onUpdate(listener: (update: LiveUpdate) => void): () => void;
}
