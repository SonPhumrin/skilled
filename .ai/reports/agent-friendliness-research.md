# Agent-friendliness and lifecycle research

**Question.** How do we make `skilled` maximally agent-friendly for someone starting out, stay lightweight in context cost, keep engineering precision, and hold up from dev through production release — across three use cases: **(1) a new project, (2) an existing project, (3) refactoring an existing project**?

**Method.** Two web research passes (upstream + spec/best-practice; brownfield + production safety), plus direct measurement of this repo's context footprint and frontmatter compliance. All claims below carry sources; inferences are flagged.

---

## 1. Headline findings

1. **The library is greenfield-shaped, and the three use cases need three different control loops — not one pipeline.** This is the single most important finding. Forcing the full `idea → interview → spec → tickets → implement` flow onto a one-line change in an existing repo is a *documented* failure mode, not a hypothetical.
2. **The context cost is already good — better than the raw numbers suggest.** Because user-invoked skills contribute *zero* to context, only 14 of 37 skills cost anything. That architecture is sound; it just needs trimming.
3. **Four skills carry a frontmatter field that hard-fails packaging.** `argument-hint` is not in the Agent Skills spec.
4. **There is zero upstream drift.** `3cca18b` is still HEAD of `mattpocock/skills`. `skilled-update` has nothing to diff today.
5. **The highest-value missing safeguard is test integrity** — agents deleting or weakening tests to reach green. Three independent sources converge on this.

---

## 2. Upstream status: no drift, but real structural divergence

`mattpocock/skills` `pushed_at` is `2026-09-04T08:45:43Z`; the newest commit is `3cca18b`, dated `2026-09-04T08:43:27Z`. **The ported commit is HEAD** — there is nothing to catch up on. This turns the question from "catch up" into "design forward."

But upstream has grown structure this fork does not have. Its `CLAUDE.md`:

> "Skills are organized into bucket folders under `skills/`: `engineering/`: daily code work; `productivity/`: daily non-code workflow tools; `misc/`: kept around but rarely used, not promoted; `in-progress/`: beta…; `deprecated/`: no longer used"

| Upstream mechanism | This repo |
| :--- | :--- |
| Bucket folders (`engineering/`, `productivity/`, `misc/`, `in-progress/`, `deprecated/`) | Flat `skills/*` |
| Per-skill `agents/openai.yaml` carrying `policy.allow_implicit_invocation: false` for Codex | Absent — no Codex support |
| `.claude-plugin/plugin.json` shipping the promoted set as a managed bundle | Absent |
| Per-skill human docs pages at `aihero.dev/skills-<name>` with fixed sections | Absent |
| A published journey taxonomy with explicit "Start with X" per group | README only |
| Repo-wide prose rule (no em-dashes) | Absent |

Upstream's own README states the invocation axis this repo already copied:

> "**User-invoked** skills are reachable only when you type them…; their job is to orchestrate. **Model-invoked** skills can be invoked by you *or* reached for automatically… A user-invoked skill may invoke model-invoked skills, but never another user-invoked one."

And notably, upstream **fixed this exact invariant on 2026-08-15**: commit `1dab982`, *"Stop skills from calling other user-invoked skills (Fixes #453)"*. The invariant is battle-tested upstream.

**Actionable:** renaming a skill is expensive. `skills.sh` retains historical names — `writing-great-skills` (322.9K installs) still competes with its renamed successor `writing-for-agents` (245.2K), and Matt's own docs confirm *"There is no alias. Reinstall under the new name."* Prefer adding over renaming.

---

## 3. Measured context footprint

Direct measurement of `skills/*/SKILL.md` in this repo:

| Bucket | Chars | ~Tokens |
| :--- | ---: | ---: |
| **Always loaded** (14 model-invoked: `name` + `description`) | **3,807** | **~952** |
| 23 user-invoked | 3,025 | ~756 |
| Naive total (if all 37 were model-invoked) | 6,832 | ~1,708 |
| Total `SKILL.md` body text (loaded on demand only) | 160,581 | ~40,145 |

**The architecture is working.** Claude Code documents that `disable-model-invocation: true` means *"Description not in context, full skill loads when you invoke"* and *"removes the skill from Claude's context entirely."* So the 23 user-invoked skills cost **nothing** until typed. Only 3,807 chars are permanently resident.

**But that is close to the ceiling.** Claude Code's listing budget:

> "Claude Code shortens descriptions to fit the listing's **character budget**… The budget scales at **1% of the model's context window**. When the listing overflows, Claude Code **drops descriptions starting with the skills you invoke least**."

The budget is measured in **characters** (confirmed: `SLASH_COMMAND_TOOL_CHAR_BUDGET` takes "a fixed character count"). At the literal reading — 1% of a 200,000-token window = **2,000 characters** — 3,807 chars is **~190% of budget**. At the more generous reading (1% of the window's character count ≈ 8,000 chars) it is comfortably inside.

⚠️ **The docs do not state a numeric default for `skillListingBudgetFraction`, so this cannot be resolved from documentation alone.** Run `/doctor` in a live session for the real number — it reports *"an estimate of the listing's context cost and its biggest contributors."*

**Either way the fix is the same, and it is cheap:** the four fattest descriptions are `code-craft` (565 chars), `verify-in-browser` (420), `review-diff` (419), and `generate-runbook` (316). All four are model-invoked, so all four are permanent residents. Trimming `code-craft` alone recovers ~15% of the budget.

**Descriptions are all within the spec's 1,024-char cap.** Nothing is over.

**Bodies are well within guidance.** Anthropic recommends `SKILL.md` stay under 500 lines; the largest here is 134 lines (`diagnose-bug`). 16 skills use progressive disclosure across multiple files — `code-craft` (8 files), `skilled-setup` (9), `teach` (5). This is correct practice.

---

## 4. Frontmatter compliance risk

Four skills carry `argument-hint`: `design-workflows`, `handoff`, `handoff-to-agent`, `teach`.

The Agent Skills spec's complete allowed field set is `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Claude Code's docs are explicit about what happens outside Claude Code:

> "Including any other field (e.g., `argument-hint`) in a claude.ai upload / Skills API / `package_skill.py` packaging fails with a hard error: `Unexpected key(s) in SKILL.md frontmatter: argument-hint. Allowed properties are: allowed-tools, compatibility, description, license, metadata, name`"

`CONVENTIONS.md:31` already commits to *"Stay inside the six-field Agent Skills spec wherever possible, so these skills also load on claude.ai, through the Skills API, and on OpenCode and Antigravity."* **The four `argument-hint` uses break that stated goal.** They are also invisible to the current validator, which lists `argument-hint` in `KNOWN_FIELDS` and therefore passes them.

This is the cheapest high-value fix in the report: move the hint into the body, or accept Claude-Code-only distribution and document it.

---

## 5. The core finding: three use cases, three control loops

The evidence is unusually consistent here, and it comes from the person whose framework this library descends from.

**Birgitta Böckeler (Thoughtworks), writing on martinfowler.com** about spec-driven development tools:

> "For two of the three tools I tried it also seems to be **even more work to introduce them into an existing codebase**, therefore making it even harder to evaluate their usefulness for brownfield codebases."

> "the agent ignored the notes that these were descriptions of existing classes, **it just took them as a new specification and generated them all over again, creating duplicates**."

And the over-processing failure mode, on a *small bug fix*:

> "it quickly became clear that the workflow was like using a **sledgehammer to crack a nut**. The requirements document turned this small bug into 4 'user stories' with a total of 16 acceptance criteria…"

> "I never even finished the full implementation, but I think in the same time it took me to run and review the spec-kit results I could have implemented the feature with 'plain' AI-assisted coding, and I would have felt much more in control."

Her prescription:

> "An effective SDD tool would at the very least have to provide **flexibility for a few different core workflows, for different sizes and types of changes**."

**Augment Code** names the brownfield distinction precisely:

> "Spec-driven development in brownfield enterprise codebases is most effective when teams write **change-level specifications rather than full-system specs**, because undocumented dependencies and scale make comprehensive upfront specifications impractical."

> "The greenfield habit of writing a comprehensive spec and generating code from it **does not survive contact with an undocumented legacy system**."

A change-level spec has four elements: **current behavior**, **target behavior**, **invariants** (what must not change), **scope boundary** (what is excluded).

**OpenSpec** implements the delta model:

> "Spec Kit's specs describe what a system *should become*. OpenSpec's specs describe what a system *currently does* — and then layers proposed changes on top as explicit, reviewable deltas."

Anthropic's own harness guidance makes the same call as a routing decision:

> "Planning is most useful when you're uncertain about the approach, when the change modifies multiple files, or when you're unfamiliar with the code being modified. **If you could describe the diff in one sentence, skip the plan.**"

### Mapping this onto `skilled`

| Use case | What the research says works | What `skilled` has today |
| :--- | :--- | :--- |
| **New project** | Spec-first. Full ceremony earns its keep. | ✅ Strong. `domain-interview` → `design-doc` → `write-spec` → `write-tickets` → `implement` |
| **Existing project** | Change-level spec; existing tests as the oracle; ceremony scales *down*. | ⚠️ Partial. The flow exists but assumes greenfield; no "small change" path; `write-spec` has no current-behavior/invariants/scope-boundary framing |
| **Refactor existing** | Characterization harness first; two hats; discovery-only pass; small reversible steps. | ❌ Weak. `architecture-review` is correctly discovery-only, but there is **no characterization testing, no Feathers technique, no refactoring discipline** |

The refactor column is the real hole. Everything needed to make a refactor *safe* is missing.

---

## 6. Gap analysis: what would actually bite

### 6.1 Refactoring safely (biggest gap)

The canonical discipline is Michael Feathers' *Working Effectively with Legacy Code*: **"cover and modify, never edit and pray."** The dilemma is that you need tests to change code safely, but getting tests in place requires changing code. The way out is a fixed sequence — identify change points, find test points, break dependencies, write tests, *then* change.

Named techniques, all codified in existing agent skills:
- **Characterization tests** — *"documents what the code actually does right now — not what the spec, the comments, or anyone's memory says it should do."* Write a probe you know will fail, let the failure reveal real behavior, then pin it.
- **Seams** — *"a place where you can alter behavior in your program without editing in that place."*
- **Sprout / Wrap** — for when you cannot get the area under test: *"The untested host changes by exactly one call site, so the unverified blast radius is a single line instead of the whole method."*
- **Dependency-breaking catalog** — Extract Interface, Parameterize Constructor, Extract and Override Factory Method, Adapt Parameter, Break Out Method Object, Subclass and Override Method. Priority rule: *"always pick the least invasive technique that unblocks you."*

**Fowler's Two Hats** — never refactor and add behavior at once, and always state which hat you are wearing. The green suite is the precondition:

> "With self-testing code… People are confident that fixing small problems to clean the code can be done safely, because should you make a mistake… the bug detector will go off and you can quickly recover."

**Strangler fig vs. branch by abstraction** (AWS Prescriptive Guidance) — branch by abstraction when the component has upstream dependencies:

> "Allows for incremental changes that are reversible in case anything goes wrong (backward compatible)… Provides an easy way to implement a fallback mechanism by using an intermediate verification step to call both new and old functionality."

**Google's own brownfield agent-skill pack** (Antigravity codelab) codifies exactly this shape: hardcoded **Plan-and-Execute** to stop drift, a **Reflexion loop driven by TDD**, and reverse-engineered markdown deliverables (`API_Contracts.md`, `Business_Logic_Rules.md`, `Data_Models.md`). Its two stated authoring principles are **conciseness** and **progressive disclosure** — the same constraints you are working under.

### 6.2 Production release safety

Not a single skill in the current 37 touches any of this.

**Database migrations** — the expand → migrate → contract sequence. The rule set worth shipping verbatim:

> "1. **NEVER** run untested migrations directly in production. 2. **NEVER** drop a column without first removing all application references and deploying. 3. **NEVER** add `NOT NULL` to a large table without a default value in a single statement. 4. **NEVER** mix schema DDL and data mutations in the same migration file. 5. **NEVER** skip the dual-write phase when renaming columns in a live system. 6. **NEVER** assume migrations are instantaneous. 7. **NEVER** disable foreign key checks to 'speed up' migrations. 8. **NEVER** deploy application code that depends on a schema change before the migration has completed."

The core insight: *"Application servers rarely roll out atomically: during a rolling deploy, version N and version N+1 coexist."*

**Feature flags and progressive rollout** — canonical ladder `1% → 5% → 25% → 100%`, with the flag as *"a kill switch, letting you disable the feature instantly without redeploying."* And the caveat: *"Without [monitoring], you're just rolling out blindly."*

**Rollback** — the honest framing:

> "rollback plans are usually written at the same time as the deployment plan — which means they're written by someone who is optimistic, not someone who is panicking at 2 a.m."

> "some migrations are effectively **one-way doors**."

The five-part discipline: classify migrations before writing them; test rollback scripts like migrations; define an explicit rollback window; build forward-fix as a first-class option; validate PITR quarterly. *"A rollback plan you've never executed is a hypothesis, not a strategy."*

**Release readiness** — Google SRE's Launch Coordination Checklist (architecture, capacity, failover, monitoring, security, automation, external dependencies, rollout planning) and the Production Readiness Review. GitLab's PRR is itself codified as a merge request — a good model for "release readiness as a reviewable artifact."

**Observability at release** — Liz Fong-Jones, on agent-generated diffs:

> "**When agents generate most of your diffs, you can't validate by reading every line; the proof has to come from production telemetry.**"

Charity Majors: *"they're not learning faster, they're just accumulating risk faster."*

Anthropic's operational version: *"Always provide verification (tests, scripts, screenshots). **If you can't verify it, don't ship it.**"*

**Dependency/supply chain** — OWASP: generate SBOMs during build, standard formats (SPDX/CycloneDX), sign artifacts, triage CVE → component → exploitability with VEX.

⚠️ **One conflict to encode as a decision, not a rule:** OWASP says env vars are *discouraged* for secrets (*"environment variables are generally accessible to all processes and may be included in logs"*), while the Twelve-Factor App says the opposite (*"The twelve-factor app stores config in environment variables… there is little chance of them being checked into the code repo accidentally"*). Both are defensible. Present the trade-off.

### 6.3 Test integrity — the highest-value single safeguard

Three independent sources converge:

**Kent Beck**, via Pragmatic Engineer:

> "What *is* surprising is how he's having trouble stopping AI agents from **deleting tests in order to make them 'pass!'**"

**Google's FSE 2025 migration paper** (`arXiv:2504.09691`, 39 migrations, 93,574 edits, 69% LLM-generated): hallucination caused *"25.55% of the code changes"* to need manual handling, and crucially —

> "If the regression test suite has **pre-existing failures** unrelated to the code change under review, validation of the code change fails at the 'Test' step."

That means an already-flaky suite silently blocks the whole safety net.

**Meta's TestGen-LLM** (`arXiv:2402.09171`) shows the counter-pattern — generate-then-verify with a filter that *guarantees improvement*: *"75% of TestGen-LLM's test cases built correctly, 57% passed reliably, and 25% increased coverage."*

**Nothing in `skilled` currently forbids an agent from editing a test to reach green.** `tdd` owns the red-green-refactor loop and `review-diff` reviews the diff, but neither states the rule. This is a one-sentence fix with outsized value.

Google's validation ladder is also worth stealing as a general pattern — cheap checks first, discard on first failure, escalate to expensive:

> "(1) Success… (2) Whitespace… (3) AST parser… (4) Punt… (5) Build… (6) Test… The validations are conducted in the listed order from less expensive to more expensive."

---

## 7. Recommendations, prioritized

Ordered by value-per-unit-of-context-cost. Each is sized against the "lightweight" constraint.

### P0 — correctness and compliance (hours, not days)

| # | Change | Why |
| :--- | :--- | :--- |
| P0.1 | **Remove `argument-hint` from the 4 skills**; move the hint into the body | Currently hard-fails claude.ai / Skills API packaging, contradicting `CONVENTIONS.md:31` |
| P0.2 | **Add a test-integrity rule** to `tdd` (and have `review-diff` surface test diffs) | The #1 documented agent failure mode. One sentence. |
| P0.3 | **Fix `domain-interview/SKILL.md:9`** — the raw `skills/skilled/SKILL.md` path reference | Violates `CONVENTIONS.md:27`; introduced by `45e6a1c` |
| P0.4 | **Make the validator enforce two things it currently misses**: (a) the invocation invariant — no call may target a user-invoked skill; (b) the six-field spec allow-list, flagging `argument-hint` | Both are the repo's own stated rules, currently convention-only |
| P0.5 | **Trim the four fattest descriptions** (`code-craft` 565 → ~250 chars) | Recovers ~15% of the listing budget for free; `code-craft`'s triggers are the most compressible |

### P1 — the three loops (the substantive work)

| # | Change | Why |
| :--- | :--- | :--- |
| P1.1 | **New model-invoked skill: `characterization-tests`** — the "cover and modify" harness. Feathers' sequence, seams, sprout/wrap, dependency-breaking catalog, golden-master caveats | Unblocks all safe refactoring. Currently absent entirely. |
| P1.2 | **New model-invoked skill: `refactor-safely`** — Two Hats, green-suite precondition, small reversible steps, behavior-preservation verification, strangler vs. branch-by-abstraction | The discipline layer above P1.1. |
| P1.3 | **New model-invoked skill: `investigate-codebase`** — Feathers' comprehension techniques: effect sketches, feature sketches, pinch points, scratch refactoring. Evidence-cited, adversarial, explicitly forbidden from guessing | Meta measured **40% fewer agent tool calls per task** with good context files. Their format: *"compass, not encyclopedia"* — 25–35 lines, four sections: Quick Commands / Key Files / Non-Obvious patterns / See Also |
| P1.4 | **Reframe `write-spec` for existing systems** — when the target is an existing system, emit a *change-level* spec: current behavior / target behavior / invariants / scope boundary | Directly prevents Böckeler's documented duplicate-generation failure |
| P1.5 | **New model-invoked skill: `ship-safely`** — migrations (expand/contract), feature flags, rollback window, observability gate, release-readiness checklist | Nothing in the current 37 covers release. This is the "no issue at release to prod" requirement. |

### P2 — the starter experience

| # | Change | Why |
| :--- | :--- | :--- |
| P2.1 | **Have `/skilled` ask which of the three situations applies, first**: new project / change to existing / refactor existing | Every comparable framework does this. BMAD: *"Build your first project"* vs *"Add BMad to an existing codebase"* — two explicit entry points |
| P2.2 | **Add an explicit small-change fast path** — a stated license to skip `design-doc`/`write-tickets` when the diff is one sentence | Anthropic: *"If you could describe the diff in one sentence, skip the plan."* Böckeler's whole critique is the absence of this |
| P2.3 | **Publish a journey taxonomy with "Start with X" per group** in the README | Upstream does exactly this on aihero.dev: Getting Started / The Main Flow / Shaping / Upkeep / Productivity / Reference |
| P2.4 | Consider **bucket folders** (`engineering/`, `productivity/`, …) | Upstream convention; helps a newcomer scan 40+ skills. Costs a migration; low urgency |

### P3 — deliberate non-goals

Resist these; each is a documented way to fail the "lightweight" goal:

- **A `bmad doctor`-style repair command** — maintenance surface with no evidence of need yet.
- **A Codex `agents/openai.yaml` layer** — only if Codex support is actually wanted; it doubles the frontmatter maintenance for every user-invoked skill.
- **A full per-skill docs site** — the README plus `/skilled` already carry this.
- **Renaming skills.** `skills.sh` retains old names and they keep competing. Add, don't rename.

---

## 8. What this implies for the "lightweight" goal

The measurement says the library is *already* lightweight where it counts: **3,807 characters permanently resident, 23 of 37 skills costing nothing.** The threat to lightness is not the current design — it is the natural pull toward adding a full pipeline.

The research is unambiguous that the fix is **fewer, smaller loops, selected by situation** — not one loop with more branches. Böckeler's closing concern is the German *Verschlimmbesserung*, "making something worse in the attempt of making it better."

A useful discipline for each proposed addition, drawn from `writing-for-agents` itself: **if it only ever fires by hand, make it user-invoked and pay no context load.** The three new lifecycle skills (`characterization-tests`, `refactor-safely`, `ship-safely`) should be model-invoked, because they must fire on their own when the agent is about to refactor or ship. `investigate-codebase` likewise. That is ~4 new permanent residents — worth budgeting for explicitly, and offset by the P0.5 trims.

---

## 9. Confidence and gaps

**High confidence** — sourced and consistent across multiple independent references: the three-loops finding; Feathers' techniques; the migration/flag/rollback rules; the test-integrity safeguard; the `argument-hint` spec violation; the upstream-drift status.

**Unresolved, needs a live measurement:**
- The true listing budget. Run `/doctor` and `/skill-doctor` in a real session. Documentation does not state a numeric default for `skillListingBudgetFraction`.
- Whether pre-written context files help or hurt. Meta's engineering blog explicitly rebuts recent academic findings that they *decreased* agent success on well-known OSS repos, arguing the difference is whether the knowledge exists in model training data. **This is a live disagreement, not settled.** For a proprietary codebase the Meta finding likely applies; for a mainstream OSS stack it may not.

**Thin evidence:**
- No authoritative standard for brownfield agent workflows exists. The closest artifacts are single-vendor (BrownKit, OpenSpec, Google's Antigravity pack).
- No formal mapping of Fowler's full refactoring catalog to agent skills. The two-hats rule and characterization testing are well codified; the catalog itself is largely left to the model.
- Differential testing for agent refactors is essentially uncodified.
- No published rigorous measurement of "spec-of-the-change" workflows. Augment Code itself says teams are still "establishing baselines."
