---
description: Deep bug review via opencode (deepseek) - confirms/refutes findings, finds subtle bugs - saves Claude tokens
allowed-tools: Bash(opencode run:*)
---

First, read `.claude/settings.json` in this project. If the top-level key `skilledOpencodeDelegation` is not exactly `true`, tell the user this add-on is off (edit `.claude/settings.json` and set `"skilledOpencodeDelegation": true` to enable it) and stop — do not run `opencode`.

Run a deep bug review using opencode:

SCOPE: $ARGUMENTS

`bug-reviewer` is an opencode subagent, not a primary agent — `opencode run --agent bug-reviewer` alone falls back to the default agent (with a warning, not silently) and wastes the run. Run exactly one command instead:
`opencode run --agent orchestrator "Delegate to the bug-reviewer subagent: <scope + any prior findings to confirm/refute + what the code is supposed to do>. Relay only the bug-reviewer's raw output."`

Launch it via the Bash tool with `run_in_background: true` — do not hand-roll `&`/polling loops. Immediately attach the `Monitor` tool to the background task so its output streams live instead of going silent until it finishes.

Rules:
- Relay: confirmed bugs (with code-path traces), then refuted false positives. Do not fix anything unless I ask.
