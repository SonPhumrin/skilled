---
description: Deep-research a task via opencode workers, then produce a senior-engineer plan (changes, blast radius, options with pros/cons, risks) - no code changes yet
allowed-tools: Bash(opencode run:*), Bash(git log:*), Bash(git status:*)
---

First, read `.claude/settings.json` in this project. If the top-level key `skilledOpencodeDelegation` is not exactly `true`, tell the user this add-on is off (edit `.claude/settings.json` and set `"skilledOpencodeDelegation": true` to enable it) and stop — do not run `opencode`.

RESEARCH & PLAN the following task using your opencode worker team — do NOT implement anything:

TASK: $ARGUMENTS

`researcher` is an opencode subagent, not a primary agent — invoke it via `opencode run --agent orchestrator "Delegate to the researcher subagent: <brief>. Relay only the researcher's raw output."`, launched via the Bash tool with `run_in_background: true` (never hand-roll `&`/polling loops). Immediately attach the `Monitor` tool to each background task so its output streams live instead of going silent until it finishes.

Workflow:
1. RESEARCH: dispatch parallel `researcher` briefs this way (3-5 min timeout each, run in parallel where independent — either as separate background calls or one orchestrator call that delegates several in parallel itself):
   - How the affected system works today (architecture, key files, data flow)
   - Impact surface: callers, dependents, tests, config that touch this code
   - Conventions & dependencies to follow
2. SPEC: write `.ai/plans/<short-slug>.md` — a senior-engineer plan:
   - Objective & context
   - Current state (with file:line evidence from research)
   - Change list: per file/module, exactly what to update and why
   - Blast radius: everything affected, directly and indirectly
   - Options considered: 2-3 approaches, pros/cons for each, your pick and why
   - Risks & mitigations
   - Verification plan
3. PRESENT the plan to me in the chat (condensed — full version in the file) and wait for my approval before any implementation.

Rules: briefs must be self-contained (workers can't see this conversation). Save long research outputs to `.ai/reports/last-report.md` and read only summaries. No code edits in this phase.
