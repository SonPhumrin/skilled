import type { ZodRawShape, z } from "zod";
import type { ModelOption, PermissionDecision, PermissionMode, ThreadEvent } from "../../shared/types";

export interface ToolOutput {
  text: string;
  /** A PNG the model should see, base64. */
  imagePng?: string;
  isError?: boolean;
}

/**
 * A tool the harness itself provides to the agent (the browser pane's tools,
 * for one). Drivers expose these however their agent takes tools: an
 * in-process MCP server for Claude.
 */
export interface HarnessTool<Shape extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  input: Shape;
  /** Safe to run without asking in "ask" mode. */
  autoAllow: boolean;
  run(args: z.infer<z.ZodObject<Shape>>): Promise<ToolOutput>;
}

/** What a driver needs for one turn. */
export interface TurnInput {
  threadId: string;
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
  /** Harness-provided tools for this turn; empty when none apply. */
  tools: HarnessTool[];
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
  /**
   * How this agent names skilled's skills in a Skill-tool call: "skilled:"
   * for Claude, which loads them as a plugin; "" for agents that load them
   * by bare name.
   */
  skillCallPrefix: string;
  runTurn(input: TurnInput): Promise<void>;
  /** Stop any agent processes the driver keeps alive. */
  dispose?(): void;
}
