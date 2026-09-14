---
description: Delegate implementation to opencode (writes code, runs lint) - saves Claude tokens
allowed-tools: Bash(opencode run:*)
---

First, read `.claude/settings.json` in this project. If the top-level key `skilledOpencodeDelegation` is not exactly `true`, tell the user this add-on is off (edit `.claude/settings.json` and set `"skilledOpencodeDelegation": true` to enable it) and stop — do not run `opencode`.

Delegate this implementation to opencode instead of editing files yourself:

BRIEF: $ARGUMENTS

Unless the brief explicitly says otherwise, preserve the current application's
architecture and coding system: existing component/module structure, theme,
color palette, typography, spacing, responsive behavior, and design tokens. Read
the relevant current implementation before changing it. Keep the change minimal,
precise, and consistent with established patterns; do not introduce generic UI
or redesign existing behavior.

`implementer` is an opencode subagent, not a primary agent — `opencode run --agent implementer` alone falls back to the default agent (with a warning, not silently) and wastes the run. Run exactly one command instead:
`opencode run --agent orchestrator "Delegate to the implementer subagent: <the brief: exact change, files/paths, constraints, conventions to follow>. Relay only the implementer's raw output."`

Launch it via the Bash tool with `run_in_background: true` — do not hand-roll `&`/polling loops. Immediately attach the `Monitor` tool to the background task so its output streams live instead of going silent until it finishes.

Rules:
- Include the full plan in the brief — opencode can't see this conversation.
- Relay the result: files changed + verification results. Only inspect the diff yourself if I ask.
