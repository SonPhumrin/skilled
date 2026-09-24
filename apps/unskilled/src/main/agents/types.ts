import type { ModelOption, PermissionDecision, PermissionMode, ThreadEvent } from "../../shared/types";

/** What a driver needs for one turn. */
export interface TurnInput {
  cwd: string;
  prompt: string;
  /** The agent's session to resume, or null for a new conversation. */
  sessionId: string | null;
  model: string;
  permissionMode: PermissionMode;
  signal: AbortSignal;
  onEvent(event: ThreadEvent): void;
  onTextDelta(text: string): void;
  onSession(sessionId: string): void;
  requestPermission(req: { toolName: string; summary: string; canAlwaysAllow: boolean }): Promise<PermissionDecision>;
}

/**
 * One agent backend. Milestone 1 ships Claude (Agent SDK); Codex
 * (app-server) and ACP agents (deepseek-harness, Gemini, Cursor) implement
 * the same interface next.
 */
export interface AgentDriver {
  id: string;
  label: string;
  models(): ModelOption[];
  defaultModel: string;
  runTurn(input: TurnInput): Promise<void>;
}
