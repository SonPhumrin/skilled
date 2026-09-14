---
description: Claude Code orchestrates a full task using the opencode worker team (research -> implement -> bug-check -> verify) - saves Claude tokens
allowed-tools: Bash(opencode run:*), Bash(git diff:*), Bash(git status:*), Bash(git log:*)
---

First, read `.claude/settings.json` in this project. If the top-level key `skilledOpencodeDelegation` is not exactly `true`, tell the user this add-on is off (edit `.claude/settings.json` and set `"skilledOpencodeDelegation": true` to enable it) and stop — do not run `opencode`.

ORCHESTRATE the following task using your opencode worker team — you are the lead, they do the heavy lifting:

TASK: $ARGUMENTS

All subagents (`researcher`, `implementer`, `bug-catcher`, `verifier`, `bug-reviewer`) are opencode subagents, not primary agents — `opencode run --agent <name>` only works for primary agents like `orchestrator`. Invoke each one through: `opencode run --agent orchestrator "Delegate to the <agent> subagent: <brief>. Relay only that subagent's raw output."` Run these via the Bash tool with `run_in_background: true` — never hand-roll `&`/polling loops (a manual `pgrep`-based wait can match its own command line and hang forever). Immediately after launching, attach the `Monitor` tool to that background task: it streams each stdout line live as the run produces it, so progress is visible the whole time instead of only at completion.

Workflow:
1. RESEARCH: dispatch parallel `researcher` briefs this way (how the system works, impact surface, conventions). Briefs must be self-contained.
2. SPEC: write `.ai/plans/<slug>.md` — senior-engineer plan: objective, current state (file:line evidence), per-file change list, blast radius, 2-3 options with pros/cons + your pick, risks & mitigations, verification plan. Present it to me and wait for approval (skip only if I said "just do it").
3. DELEGATE each subtask the same way, naming the target subagent in the brief:
   - `implementer` (the actual code changes — 10-min timeout; pass the plan doc path)
   - `bug-catcher` (fast sweep of the changes)
   - `verifier` (tests/lint/typecheck)
   - `bug-reviewer` (only for large/risky changes)
4. REVIEW: `git diff`, read key changes, spot-check claims against the plan's change list. Fix small issues (< ~20 lines) yourself; send bigger ones back to a worker.
5. REPORT: what was done, files touched, your review verdict, remaining risks.
