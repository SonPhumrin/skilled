---
description: Delegate read-only research to opencode (fast deepseek) - saves Claude tokens
allowed-tools: Bash(opencode run:*)
---

First, read `.claude/settings.json` in this project. If the top-level key `skilledOpencodeDelegation` is not exactly `true`, tell the user this add-on is off (edit `.claude/settings.json` and set `"skilledOpencodeDelegation": true` to enable it) and stop — do not run `opencode`.

Research this question using opencode instead of exploring the codebase yourself:

QUESTION: $ARGUMENTS

`researcher` is an opencode subagent, not a primary agent — `opencode run --agent researcher` alone falls back to the default agent (with a warning, not silently) and wastes the run. Run exactly one command instead:
`opencode run --agent orchestrator "Delegate to the researcher subagent: <the question, with context: what project area, what you need to know and why>. Relay only the researcher's raw output."`

Launch it via the Bash tool with `run_in_background: true` — do not hand-roll `&`/polling loops. Immediately attach the `Monitor` tool to the background task so its output streams live instead of going silent until it finishes.

Rules:
- The brief must be self-contained.
- Relay the answer concisely with file:line evidence. Do not re-verify with your own tool calls unless I ask.
