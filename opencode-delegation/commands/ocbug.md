---
description: Fast bug sweep via opencode (deepseek) on changed code or a scope - saves Claude tokens
allowed-tools: Bash(opencode run:*)
---

First, read `.claude/settings.json` in this project. If the top-level key `skilledOpencodeDelegation` is not exactly `true`, tell the user this add-on is off (edit `.claude/settings.json` and set `"skilledOpencodeDelegation": true` to enable it) and stop — do not run `opencode`.

Run a fast bug sweep using opencode:

SCOPE: $ARGUMENTS

`bug-catcher` is an opencode subagent, not a primary agent — `opencode run --agent bug-catcher` alone falls back to the default agent (with a warning, not silently) and wastes the run. Run exactly one command instead:
`opencode run --agent orchestrator "Delegate to the bug-catcher subagent: <scope: files/dirs or 'the current git diff'. Include what the code is supposed to do>. Relay only the bug-catcher's raw output."`

Launch it via the Bash tool with `run_in_background: true` — do not hand-roll `&`/polling loops. Immediately attach the `Monitor` tool to the background task so its output streams live instead of going silent until it finishes.

Rules:
- Relay findings grouped by severity with file:line. Do not fix anything unless I ask.
