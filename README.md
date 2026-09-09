# skilled

Agent skills for building software: alignment before code, design discipline while writing it, and review before it ships.

## How it works

Two things happen independently: **installing** puts the skill files where an agent can find them; **using** them is just working normally and letting the right one fire, or typing one by name.

### Install

Skills live once, here, and get symlinked into whichever project you point `install.sh` at. Nothing is copied, so a `git pull` in this repo updates every project that has it installed.

```mermaid
flowchart LR
    Repo["skilled/skills/*<br/>(this repo, one copy)"]

    Repo -- "install.sh /path/to/project" --> ClaudeDir[".claude/skills/<br/>(in that project)"]
    Repo -- "install.sh /path/to/project" --> AgentsDir[".agents/skills/<br/>(in that project)"]
    Repo -- "install.sh /path/to/project" --> SkillsJson[".agents/skills.json<br/>(in that project)"]
    Repo -- "install.sh /path/to/project" --> OcJson["opencode.json<br/>(in that project)"]

    ClaudeDir --> ClaudeCode["Claude Code"]
    AgentsDir --> Antigravity["Antigravity CLI / IDE"]
    SkillsJson --> Antigravity
    OcJson --> OpenCode["OpenCode"]

    style Repo fill:#2d2d2d,color:#fff,stroke:#888
    style ClaudeCode fill:#3b5bdb,color:#fff,stroke:#333
    style OpenCode fill:#3b5bdb,color:#fff,stroke:#333
    style Antigravity fill:#3b5bdb,color:#fff,stroke:#333
```

`.claude/skills/` is Claude Code's native project scope. Antigravity reads `.agents/skills/` as its native project scope too, plus `.agents/skills.json` as a documented fallback, since its directory scan has been observed going stale on a symlinked folder. OpenCode has no project-level directory scan at all — its own docs say external-skill auto-load only covers the *global* `~/.claude/` and `~/.agents/`, never a project's — so `install.sh` registers this repo straight into the project's `opencode.json` instead. See [Supported harnesses](#supported-harnesses) for the harness-by-harness detail.

### Use

Once installed, most of this runs itself: model-invoked skills fire on their own when the conversation matches their trigger. User-invoked skills are typed, like `/skilled` or `/implement`. The typical path through a piece of work:

<p align="center"><img src="assets/workflow.svg" alt="How a change moves through skilled: idea → alignment (domain-interview, or skilled-setup first time) → optional design-doc → write-spec → write-tickets → implement (driving tdd and all seven design-quality skills) → verify-in-browser → review-diff → committed. Triage and decision-map feed in from the side for piled-up bugs and foggy effort." width="720"></p>

`/skilled` is the entry point when you forget any of this: it names every user-invoked skill and reports which project documents are missing. Read [CONVENTIONS.md](CONVENTIONS.md) for how the model-invoked/user-invoked split works and why one skill can call another.

## Install

```bash
git clone https://github.com/SonPhumrin/skilled.git ~/Documents/skilled   # or wherever you keep it
cd ~/Documents/skilled
./install.sh /path/to/your-project
```

That symlinks all 37 skills into `your-project/.claude/skills/` and `your-project/.agents/skills/`. Per-project, not global: a project you haven't pointed `install.sh` at never sees these skills, and running it against several projects is normal.

```bash
./install.sh /path/to/your-project --uninstall   # remove them from that project
```

Both are idempotent — safe to re-run after editing a skill, or after `git pull` picks up an update.

Verify the install landed correctly:

```bash
python3 tests/validate_skills.py --project /path/to/your-project
```

Then, inside that project, run `/skilled-setup` once. It writes `CONTEXT.md`, `ARCHITECTURE.md`, and the tracker config the workflow skills read. From there, `/skilled` is the thing to run when you're not sure what to reach for.

## Supported harnesses

Every skill here is a plain `SKILL.md` under the open [Agent Skills](https://agentskills.io) standard, so nothing is Claude-specific by construction.

| Harness | Reads from |
| :--- | :--- |
| Claude Code | `<project>/.claude/skills/` (native) |
| Antigravity (CLI + IDE) | `<project>/.agents/skills/` (native) + `<project>/.agents/skills.json` (its own documented external-registration fallback, since the native scan can miss a symlinked folder) |
| OpenCode | `<project>/opencode.json`'s `"skills": {"paths": [...]}` entry — its external-skill auto-load only scans the *global* `~/.claude/` and `~/.agents/`, per its own embedded docs, never a project's `.claude/skills` or `.agents/skills` |

**Two real gaps, not bugs**: `disable-model-invocation` (the field that keeps the 23 user-invoked skills out of the model's own reach) is a Claude Code extension. OpenCode and Antigravity both ignore unrecognized frontmatter keys per the open spec, so on those two harnesses every skill here is model-selectable, including the ones meant to be typed by hand. There is no portable "user-only" field in the standard today.

Separately, OpenCode's project-level skill discovery isn't a directory scan at all — it's config-driven (`opencode.json`), which `install.sh` handles automatically, but a hand-edited or `.jsonc` config in that project needs the `skills.paths` entry added by hand (`install.sh` will tell you the exact line if it can't edit it for you). See [tests/MANUAL-CHECKS.md](tests/MANUAL-CHECKS.md).

`~/.agents/skills/` (the *global*, home-directory version of that second path) is deliberately never touched: it is managed by the separate `npx skills` installer with its own lockfile, and this repo only ever writes the project-local `.agents/skills/` inside a specific repo, never the one in your home directory.

## Skills

`[U]` you type it. `[M]` the agent reaches for it on its own.

### Entry points

| Skill | |
| :--- | :--- |
| `skilled` `[U]` | Router. Names every skill here and when to reach for it. |
| `skilled-setup` `[U]` | Configure a repo: issue tracker, triage labels, domain docs. Once per repo. |
| `skilled-update` `[U]` | Check whether a ported skill has changed upstream, and show the diff. Never applies silently. |

### Alignment and planning

| Skill | |
| :--- | :--- |
| `clarify-requirements` `[U]` | Get interviewed on a plan until every branch of the design tree resolves. |
| `domain-interview` `[U]` | The same interview, sharpening `CONTEXT.md` and ADRs as it goes. |
| `requirements-interview` `[M]` | The interview primitive other skills call. |
| `domain-modeling` `[M]` | Build and sharpen domain terms by challenging them against scenarios. |
| `design-doc` `[U]` | Research and write a pre-spec architecture doc, for work big enough to need one. |
| `write-spec` `[U]` | Turn this conversation into a spec on the issue tracker. |
| `write-tickets` `[U]` | Break a plan into tracer-bullet tickets with blocking edges declared. |
| `decision-map` `[U]` | Plan large work as a map of decision tickets, resolved one at a time. |

### Build

| Skill | |
| :--- | :--- |
| `implement` `[U]` | Build one ticket from a spec, driving `tdd` at agreed seams, closing with `verify-in-browser` and `review-diff`. |
| `implement-spec` `[U]` | Build a whole spec on one branch: tickets as a task graph, implementer subagents across the ready frontier, one PR. |
| `tdd` `[M]` | Red, green, refactor. |
| `prototype` `[M]` | Throwaway build to answer a design question. |
| `research` `[M]` | Investigate against primary sources, capture as a cited file. |
| `diagnose-bug` `[M]` | Build a loop that goes red on the bug, then minimise, hypothesise, instrument, fix. |

### Design and quality

| Skill | |
| :--- | :--- |
| `code-craft` `[M]` | The senior-engineer judgment ladder: how much to build, cohesion/coupling/Demeter/CQS/composition/fail-fast, naming and function shape, data/system design (async, idempotency, retries, indexing, pagination, transactions), performance/concurrency, and security by default. |
| `module-design` `[M]` | Deep modules, seams, adapters, SOLID. |
| `observability` `[M]` | What to log, what to measure, what to trace. |
| `verify-in-browser` `[M]` | Drive the app in a real browser to check a ticket's acceptance criteria, UI, and translations. |
| `review-diff` `[M]` | Two-axis review of the diff: standards and spec. |
| `architecture-review` `[U]` | Scan a codebase for deepening opportunities, then work the one you pick. |
| `enforce-module-boundaries` `[U]` | Wire dependency-cruiser so package internals are unreachable from outside. TypeScript. |

### Workflow and ops

| Skill | |
| :--- | :--- |
| `triage` `[U]` | Move issues through the triage state machine. |
| `handoff` `[U]` | Compact this conversation into a handoff document. |
| `handoff-to-agent` `[U]` | Same summary, but launches a background agent with it instead of saving a file. |
| `retro` `[U]` | Review a finished session and propose fixes to the agent environment. |
| `design-workflows` `[U]` | Design specs for the recurring workflows you want to automate. |
| `teach` `[U]` | Teach a concept across sessions, using the working directory as state. |
| `write-questionnaire` `[U]` | Turn a decision you cannot make alone into a questionnaire. |
| `explain-again` `[U]` | Fire it the moment a message does not land. |
| `git-guardrails` `[U]` | Install a hook that blocks destructive git commands. |
| `setup-pre-commit` `[U]` | Scaffold pre-commit hooks. |
| `resolve-merge-conflicts` `[M]` | Work a merge or rebase hunk by hunk, resolving by intent. |
| `generate-runbook` `[M]` | Interactive bash script for steps only a human can perform. |
| `writing-for-agents` `[M]` | How to write skills and `CLAUDE.md`. |

## Using it effectively

The skills are not a menu you pick from independently — most of the value comes from letting them chain, since each one hands off state to the next (a spec, a ticket, a diff) instead of you re-explaining context every time. Two habits make that work:

1. **Don't skip `/skilled-setup`.** Everything downstream — `/domain-interview`, `/implement`, `/review-diff` — reads `CONTEXT.md` and `ARCHITECTURE.md` for domain terms and constraints. Skip it and those skills either ask you the same questions from scratch or guess.
2. **Stay in one context window from interview through tickets.** `/domain-interview` → `/write-spec` → `/write-tickets` build on the same reasoning; splitting them across sessions loses the "why" behind each ticket. `/implement` is the one place you *should* start fresh per ticket — that's by design, so each build isn't dragging the whole planning conversation's context with it.

When you don't remember which skill fits, type `/skilled` — it reads your repo's state and tells you.

### Worked example: shipping a feature

Say you're adding rate limiting to an API, in a repo that already has `CONTEXT.md` and `ARCHITECTURE.md` (from a prior `/skilled-setup`). Terminal on the left of each step is illustrative — the shape of what comes back, not a literal transcript — the diagram on the right is what actually moved.

```
$ claude
> /domain-interview
  add per-user rate limiting to the public API

  Fixed window or token bucket? Per-user or per-API-key? What happens
  on the 429 — reject, queue, degrade? Configurable per plan?
  ...
  → writes new terms into CONTEXT.md
  → opens docs/adr/0007-rate-limit-algorithm.md (undecided, flagged for /design-doc)
```

<p align="center"><img src="assets/step-interview.svg" alt="idea to CONTEXT.md and ADR via /domain-interview" width="360"></p>

The interview pins down what "rate limiting" means here before any code exists: fixed window or token bucket, per-user or per-API-key, what happens to the 429 response, whether limits are configurable per plan. Answers get written into `CONTEXT.md` (new terms) and an ADR if the approach is non-obvious. Skip this and `/implement` will guess "reasonable defaults" that may not be yours.

Token bucket vs. fixed window, and where the bucket state lives, is a real architecture question — not something to leave to `/write-spec`'s "Implementation Decisions" section. Worth a design doc first:

```
> /design-doc

  reading CONTEXT.md, docs/adr/0007-rate-limit-algorithm.md...
  calling Skill "research" — how does the rate-limit store's client
    handle atomic increments?
  calling Skill "module-design" — token-bucket module vs. fixed-window,
    compared on depth and seam placement
  → docs/design/rate-limiting.md written
```

<p align="center"><img src="assets/step-design-doc.svg" alt="interview answers to docs/design/rate-limiting.md via /design-doc, calling research and module-design" width="450"></p>

No arguments needed — it reads back through the interview you just had. It explores the repo (respecting `CONTEXT.md`/existing ADRs), calls the Skill tool with `"research"` for anything it needs to check, calls `"module-design"` to compare the two shapes, and writes the result to `docs/design/rate-limiting.md` — a local file, not published anywhere. For a new project instead of an existing feature, this is also where you'd hand it a UI framework, component-library CLI, or color scheme to record under "Technology & Framework Choices."

```
> /write-spec

  reading the interview + docs/design/rate-limiting.md...
  → RATE-142: "Per-user rate limiting" opened on the issue tracker
```

<p align="center"><img src="assets/step-write-spec.svg" alt="interview and design doc to a spec on the issue tracker via /write-spec" width="420"></p>

Turns the interview into a spec on your issue tracker — the single source of truth `/write-tickets` and `/implement` both read from. Since `docs/design/rate-limiting.md` exists, `/write-spec` reads it and references its architecture decisions instead of re-deriving them.

```
> /write-tickets

  splitting RATE-142 into tracer-bullet tickets...
  → RATE-143 add token-bucket store
  → RATE-144 wire middleware (blocked by RATE-143)
  → RATE-145 add 429 response + headers (blocked by RATE-144)
```

<p align="center"><img src="assets/step-write-tickets.svg" alt="spec to tracer-bullet tickets with blocking edges via /write-tickets" width="420"></p>

Splits the spec into tracer-bullet tickets with blocking edges declared. Small enough each survives one `/implement` pass; ordered enough `/implement-spec` can compute what's ready to build in parallel.

```
> /implement RATE-143

  tdd: red → green → refactor at the agreed seam
  code-craft: pushes back — a queue when an in-memory counter would do,
    and flags an unindexed lookup on the bucket table
  verify-in-browser: skipped, no web UI in this ticket
  review-diff: standards clean, spec matches RATE-143
  → committed
```

<p align="center"><img src="assets/step-implement.svg" alt="one ticket to committed via /implement, with tdd and the design skills firing, then review-diff" width="440"></p>

Builds one ticket. It drives `tdd` at the seams you agreed in the interview (red → green → refactor), and while it writes code, model-invoked skills fire on their own without you calling them: `code-craft` pushes back if the implementation reaches for a queue when an in-memory counter would do, and flags an unindexed lookup if the bucket store hits Postgres per request; `observability` asks what gets logged when a user gets throttled. If the ticket had touched a screen — say, a "requests remaining" indicator in the UI — `verify-in-browser` would drive it in a real browser first. Before it lets you commit, `review-diff` checks the diff against both your team's standards and the ticket's actual spec — not just "does it run," but "does it do what RATE-143 said."

```
> /implement-spec

  ready frontier: RATE-143 (no blockers)
  RATE-143 done → RATE-144 now ready → RATE-145 now ready
  → one PR opened covering RATE-143, RATE-144, RATE-145
```

<p align="center"><img src="assets/step-implement-spec.svg" alt="whole ticket graph to one PR via /implement-spec, running implementer subagents across the ready frontier" width="420"></p>

Alternative to running `/implement` per ticket one at a time: this reads the whole ticket graph, runs implementer subagents across every ticket whose blockers are already done, and lands the result as one PR. Reach for it when the graph is wide (several independent tickets) and you'd rather not babysit each one; use per-ticket `/implement` when you want to review as you go.

If a bug shows up later — say the limiter double-counts under concurrent requests — that's `diagnose-bug` territory, either invoked directly or triggered by describing the symptom; it insists on one reproducible failing case before it lets you theorize about the cause. If issues like this pile up faster than you can single-thread them, `/triage` moves each one through the same "is this actually ready to hand an agent" gate that `/write-tickets` applies to planned work, so both paths converge on the same shape of ticket.

### Other entry points worth knowing

- **No repo yet, or a plan that isn't tied to code** → `/clarify-requirements` instead of `/domain-interview`: same interview, no `CONTEXT.md`/ADR paper trail.
- **A question you need to *feel*, not reason about** (a state machine, a UI layout) → let `prototype` build a throwaway answer, then `/handoff` the finding back into the main interview.
- **An effort too foggy to scope in one sitting** → `/decision-map` charts it as a map of decision tickets resolved one at a time, then hands off to `/write-spec` once the fog clears. Slower than the main flow — reserve it for genuine fog, not a well-scoped feature that's merely large.
- **A real architecture question, or a new project's stack/design-system to pin down** → `/design-doc` researches it and writes a local `design.md` before `/write-spec`; skip it for features whose implementation decisions fit in the spec itself.
- **A session went badly** → `/retro` afterward proposes fixes to your *environment* (a missing doc, a check that should've been automated), not the code.
- **A message didn't land** → `/explain-again`, on the spot, re-pitches what was just said in plain English.

Full skill-by-skill reference is in the [Skills](#skills) table below; `skills/skilled/SKILL.md` is the router's own source if you want the exact decision logic.

## Adding a skill

Read [CONVENTIONS.md](CONVENTIONS.md) first. The two rules that matter most: pick model-invoked or user-invoked deliberately, and do not state a rule that another skill already owns.

## Project documents

`/skilled-setup` writes three documents into a repo, and every other skill reads them:

- **`CONTEXT.md`** - the domain language. Terms defined exactly, with the synonyms that must not be used.
- **`ARCHITECTURE.md`** - the runtime shape, plus **Constraints** and **Non-goals**. Non-goals is what lets an agent decline to build something instead of guessing.
- **`docs/adr/`** - one record per non-obvious decision, so it does not get silently re-litigated.

The seed templates live in [`skills/skilled-setup/`](skills/skilled-setup/).

