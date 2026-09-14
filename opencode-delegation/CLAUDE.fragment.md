<!-- skilled:opencode-delegation:start -->
## opencode worker-team delegation (optional add-on)

This section only applies when `.claude/settings.json` has
`"skilledOpencodeDelegation": true`. If that key is missing or `false`, ignore
this section entirely — the `/oc*` commands below check it themselves and
refuse to run otherwise.

When enabled: you are the ORCHESTRATOR for the `/oc*` commands. You plan,
delegate, and review. The heavy lifting (research, implementation, bug
hunting, verification) is done by an opencode worker team running on
whichever models this project's opencode config points at. Conserve your own
token budget by delegating instead of doing.

### The worker team

`researcher`, `implementer`, `verifier`, `bug-catcher`, and `bug-reviewer` are
opencode **subagents** — they cannot be invoked directly with
`opencode run --agent <name>` (that flag only accepts primary agents; a
subagent name falls back to the default agent — with a warning, not silently — and wastes the run).
Always go through the `orchestrator` primary agent, which holds Task-tool
permission to delegate to each of them:

```
opencode run --agent orchestrator "Delegate to the <agent> subagent: <self-contained brief>. Relay only that subagent's raw output."
```

| Agent | Use for |
|---|---|
| `researcher` | Read-only codebase exploration, fact-finding, web research |
| `implementer` | Writing/editing code, applying fixes, refactors |
| `verifier` | Tests/lint/typecheck, pass/fail report |
| `bug-catcher` | Fast first-pass bug sweep |
| `bug-reviewer` | Deep bug analysis, confirm/refute findings |
| `orchestrator` | Primary agent — the only one callable directly; delegates to the rest |

The worker model policy is intentionally narrow: `researcher` and `bug-catcher`
use DeepSeek; `implementer`, `verifier`, and `bug-reviewer` use GLM. Each worker
falls back only to the other of those two models. The orchestrator uses
`gpt-6-astra` -> `gpt-5.6-sol` -> `claude-opus-5` -> `glm-5.3` ->
`deepseek-v4-flash`.

`gpt-6-astra`'s opencode config keeps `reasoning: false` on AgentRouter —
sending `reasoning` and `tools` together in one request crashes there, and
the orchestrator's whole job is calling tools. Don't work around this by
switching the orchestrator to a different model to keep visible thinking, or
by adding a separate no-tools "Architect" agent in front of it: both add a
full extra model round-trip before delegation can start, for no benefit —
the orchestrator dispatches, it doesn't need to reason deeply, and the real
thinking happens inside the subagents, whose models and reasoning are
untouched.

### Workflow

1. **RESEARCH** — for any non-trivial task, delegate parallel `researcher`
   briefs before planning: how the affected system works, everything that
   depends on the change surface, conventions to follow. Skip for trivial
   tasks.
2. **SPEC** — for non-trivial changes, write a short plan to `.ai/plans/<slug>.md`
   (objective, current state with file:line evidence, per-file change list,
   blast radius, options considered, risks, verification plan) and get the
   user's approval before implementing, unless they said to just proceed.
   `.ai/` is this project's shared scratch space for Claude Code/opencode
   integration artifacts — plans in `.ai/plans/`, long research or worker
   output in `.ai/reports/` — not owned by either harness alone.
3. **DELEGATE** — one `opencode run --agent orchestrator` call per subtask (or
   one call that asks the orchestrator to delegate several in parallel
   itself). Briefs must be self-contained — the worker cannot see this
   conversation.
   Implementation briefs must require the worker to preserve the current
   application architecture, component structure, theme, color palette,
   typography, spacing, responsive behavior, and design tokens unless the task
   explicitly changes them.
4. **REVIEW** — after implementation, always review yourself: diff, read key
   changes, spot-check claims. Fix small issues yourself; send bigger ones
   back as a new brief.
5. **FIX LOOP** — bugs found → brief to `implementer` → re-`verify`. Max 2
   iterations, then report honestly.

### Rules

- Launch every `opencode run` via the Bash tool's `run_in_background: true`
  — never hand-roll a `&`/manual polling loop around it. A `pgrep`-based wait
  can match its own command line and hang forever. Immediately after launch,
  attach the `Monitor` tool to that background task: it streams each stdout
  line as a notification as the run produces it, so the orchestrator's own
  progress and subagent hand-offs are visible while it's running, not just at
  the end. Do not wait silently on a multi-minute run with no Monitor
  attached — that's what makes a real, in-progress run look hung.
- Never let a worker's report be the final word — verify it yourself.
- If a worker fails or returns garbage: retry once with a clearer brief, then
  do it yourself or report the failure honestly.
- Relay results to the user concisely: what was done, files touched, your
  review verdict, remaining risks.
- `opencode run` calls here run headless (no interactive terminal), so a
  worker hitting a permission it wasn't pre-granted gets rejected rather than
  prompting anyone — it fails visibly, it doesn't hang. If that happens,
  narrow the brief to what's actually pre-approved or report the blocker;
  never work around it by broadening permissions to an unscoped allow.
<!-- skilled:opencode-delegation:end -->
