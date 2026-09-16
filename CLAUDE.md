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
| `architect` | Opt-in visible-reasoning pass on a hard design/architecture tradeoff (no tools, returns a plan as text) |
| `orchestrator` | Primary agent — the only one callable directly; delegates to the rest |

All agents, including the orchestrator, run on one model —
`agentrouter/deepseek-v4-flash` — called directly at
`https://agentrouter.org/v1`. No other models, no fallback chain: a failure
should surface, not cascade into a different model.

The local `localhost:3010` proxy and the `agentrouter-responses` provider are
gone; they only existed for models no longer in use. If SSE parse errors
resurface, report them — don't reintroduce a proxy to paper over it.

**Call `architect` whenever the user asks to see reasoning/thinking** ("show
your reasoning", "think out loud", "use architect", asking *why* a design
was picked) — every time, not as a judgment call. Relay its reasoning back,
don't quietly absorb it. Beyond an explicit ask, use judgment for a
genuinely hard design tradeoff before committing to an approach; otherwise
it's a full extra model round-trip not worth paying for routine dispatch.

### Workflow

1. **RESEARCH** — for any non-trivial task, delegate parallel `researcher`
   briefs before planning: how the affected system works, everything that
   depends on the change surface, conventions to follow. Skip for trivial
   tasks. If this project also has agy-delegation enabled
   (`skilledAgyDelegation: true`), decide per task which lane fits: opencode
   for codebase research/implementation/verification, agy for live web
   search, URL fetching, or browser-driven testing — see that section for
   the full split, and don't force one lane through work the other is
   better suited for.
2. **SPEC** — for non-trivial changes, write a short plan to `.ai/plans/<slug>.md`
   (objective, current state with file:line evidence, per-file change list,
   blast radius, options considered, risks, verification plan) and get the
   user's approval before implementing, unless they said to just proceed.
   `.ai/` is this project's shared scratch space for Claude Code/opencode
   integration artifacts — plans in `.ai/plans/`, long research or worker
   output in `.ai/reports/`, and raw background-command output (the
   `> file.log 2>&1` redirect target for every `opencode run` launched in
   the background) in `.ai/tmp/` — not owned by either harness alone.
   `.ai/tmp/` is gitignored; redirect there instead of `/tmp` so run output
   stays inside the project where it can actually be found again, and
   clean up a run's log once you've read what you needed from it.
3. **DELEGATE** — one `opencode run --agent orchestrator` call per subtask (or
   one call that asks the orchestrator to delegate several in parallel
   itself). Be precise and thorough writing the brief: the worker cannot see
   this conversation and gets exactly one self-contained shot at it, so state
   the exact objective, exact files/paths in scope, expected output format,
   and every constraint (read-only, don't touch X, follow existing
   conventions) up front — a vague or underspecified brief costs a full
   round-trip to a cheap-but-not-smart model instead of being caught before
   sending.
   Implementation briefs must require the worker to preserve the current
   application architecture, component structure, theme, color palette,
   typography, spacing, responsive behavior, and design tokens unless the task
   explicitly changes them.
   You are the one overseeing this, not the worker — never put a credential
   file's path or contents in a brief (`.env`, `*credentials*.json`,
   `*service-account*.json`, `google*.json`, `*.pem`, private keys, or
   anything else that looks like a secret). Workers have their own guard
   against opening these, but that's a second layer, not a reason to hand one
   over deliberately. If a task genuinely needs a secret value, handle that
   part yourself in this conversation instead of delegating it.
4. **REVIEW** — after implementation, always evaluate the worker's report
   against the brief, don't just relay it: read the actual diff and confirm
   it matches the change list you asked for, confirm claimed tests/lint were
   actually run (a command and its real output, not just an assertion of
   "PASS"), and check nothing outside the brief's scope was touched. Fix
   small issues yourself; send bigger ones back as a new brief.
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
- **For step-level visibility** (not just the final formatted reply), add
  `--format json` to `opencode run` and pipe it through `jq --unbuffered -r`
  before handing the command to Monitor. The stream is JSON Lines; each
  event has a `type` (`tool_use`, `text`, `step_start`, `step_finish`, ...).
  A `tool_use` event's `.part.tool` / `.part.state.status` /
  `.part.state.input` show exactly which tool the worker is running and
  with what arguments, live, as it happens — not just what it says it did
  afterward. Example filter surfacing tool calls and assistant text as they
  stream:
  `jq --unbuffered -r 'if .type=="tool_use" then "[tool] \(.part.tool): \(.part.state.status)" elif .type=="text" then "[text] \(.part.text)" else empty end'`.
  Reach for this when a run is long, the user asked to see what the agent is
  doing, or a run looks stuck and you need to see the last thing it tried.
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
