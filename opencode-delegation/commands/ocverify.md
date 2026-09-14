---
description: Run tests/lint/typecheck via opencode verifier - saves Claude tokens
allowed-tools: Bash(opencode run:*)
---

First, read `.claude/settings.json` in this project. If the top-level key `skilledOpencodeDelegation` is not exactly `true`, tell the user this add-on is off (edit `.claude/settings.json` and set `"skilledOpencodeDelegation": true` to enable it) and stop — do not run `opencode`.

Verify the project using opencode:

`verifier` is an opencode subagent, not a primary agent — `opencode run --agent verifier` alone falls back to the default agent (with a warning, not silently) and wastes the run. Run exactly one command instead:
`opencode run --agent orchestrator "Delegate to the verifier subagent: run the project's tests, lint, and typecheck and report pass/fail per check. Relay only the verifier's raw output."`

Launch it via the Bash tool with `run_in_background: true` — do not hand-roll `&`/polling loops. Immediately attach the `Monitor` tool to the background task so its output streams live instead of going silent until it finishes.

Rules:
- Relay the verdict: per-check PASS/FAIL, key failure lines, and whether it's ship-ready. Do not run the checks yourself unless I ask.
