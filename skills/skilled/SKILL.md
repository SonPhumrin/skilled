---
name: skilled
description: Which skill fits your situation. A router over everything in the skilled set.
disable-model-invocation: true
---

# Skilled

You do not remember every skill, so ask.

## First, report the state of this repo

Before routing, check and say in two lines:

- Do `CONTEXT.md` and `ARCHITECTURE.md` exist? If not, the answer is `/skilled-setup`, and say so before anything else.
- If `ARCHITECTURE.md` exists, read its **Constraints** and **Non-goals** and state the design posture for this session: build the direct version, and justify any new infrastructure against a named constraint.

## The main flow: idea to shipped

The route most work travels.

1. **`/domain-interview`** sharpens the idea by interview, and leaves what it learns in `CONTEXT.md` and ADRs. Start here whenever there is a repository under you. With no repository, use **`/clarify-requirements`**: same interview, no paper trail.
2. **Can every question be settled in conversation?** If one needs a runnable answer (a state model you have to feel, a UI you have to see), detour through `prototype`, bridged by **`/handoff`** in both directions.
3. **Is this a multi-session build?**
   - **Yes** → **`/write-spec`**, then **`/write-tickets`** to split it into tracer-bullet tickets, each declaring its blocking edges. Then either **`/implement`** per ticket, clearing context between each one, or **`/implement-spec`** to work the whole graph at once: it computes the ready frontier from the blocking edges and runs implementer subagents across it, landing one PR. Per-ticket when you want to stay in the loop; whole-spec when the graph is wide and you do not.
   - **No** → **`/implement`** right here.

`implement` drives `tdd` at the seams you agreed, then closes with `review-diff` before committing.

Keep steps 1 to 3 in one unbroken context window so the interview, spec, and tickets build on the same thinking. Each `/implement` then starts fresh from its ticket.

## On-ramps

Starting situations that generate work, then merge onto the main flow.

- **Bugs and requests piling up** → **`/triage`**. It moves incoming issues through triage roles until they are agent-ready. Only for issues you did not create; tickets from `write-tickets` are already ready.
- **Something is broken** → the `diagnose-bug` skill fires on its own, or ask for it. For the hard ones: the intermittent flake, the regression between two known-good states. It refuses to theorise before it has one command that goes red on this bug.
- **A large, foggy effort** too big to hold in one session → **`/decision-map`**. It charts a map of decision tickets on the tracker and resolves them one at a time, producing decisions rather than deliverables, until the way is clear. Then it hands off to `/write-spec`. Slower and denser than the main flow, so save it for genuine fog, never a well-scoped feature.

## Codebase health

- **`/enforce-module-boundaries`** makes `module-design` enforceable rather than advisory: dependency-cruiser rules so a package's internals cannot be imported from outside, failing CI when they are. TypeScript only, installed once.
- **`/architecture-review`** surveys the codebase for deepening opportunities and reports them. Picking one generates an idea to take into `/domain-interview`. It finds the candidates; `module-design` is the bench you design the chosen one on.

## What runs underneath

These are model-invoked, so they fire on their own. Named here so you know what is shaping the work, and can reach for one directly when the vocabulary rather than the process is the problem.

**Design, by altitude:**

- `code-craft` - the senior-engineer judgment ladder: how much to build, which design principle applies, naming and function shape, and general data/system design (async, idempotency, retries, indexing, pagination, transactions).
- `module-design` - interfaces, seams, adapters, SOLID.

**Domain-specific:**

- `observability` - what to log, measure, and trace.

**Process:**

- `requirements-interview` - the interview primitive behind `/clarify-requirements`, `/domain-interview`, `/triage`, and `/decision-map`.
- `domain-modeling` - the active discipline of sharpening domain terms and recording ADRs.
- `tdd`, `review-diff`, `research`, `prototype`, `diagnose-bug`, `resolve-merge-conflicts`, `generate-runbook`, `writing-for-agents`.

## Standalone

Off the main flow.

- **`/explain-again`** - fire it the moment a message does not land. The agent re-pitches what it just said, in plain English, with the context you were missing.
- **`/retro`** - run it after a session that went badly. It proposes fixes to the *environment* rather than the code: a missing navigation pointer, a check that should have been automated, a rule the reviewer should enforce, bloat in `CLAUDE.md`, tooling that burns tokens. The only skill here that improves the setup instead of the work.
- **`/handoff`** - compact this conversation into a portable file. For a new harness, a new directory, a colleague, or forking a side task mid-phase.
- **`/handoff-to-agent`** - the same summary, but it launches a background agent seeded with it and returns immediately, rather than leaving you a file to open.
- **`/design-workflows`** - design specs for the recurring workflows you want to automate. Not codebase work; reach for it when the subject is your process rather than your software.
- **`/write-questionnaire`** - when what blocks you is in someone else's head. It interviews you about the send, then aims the questions at the gap.
- **`/teach`** - learn a concept across sessions, using the working directory as state.
- **`/git-guardrails`** and **`/setup-pre-commit`** - repo safety rails, installed once.

## Precondition

**`/skilled-setup`** configures the issue tracker, triage labels, and project documents the rest of these assume. Run it before the first flow in a repo.

## Maintenance

**`/skilled-update`** checks whether any of the 26 skills ported from upstream has changed since we forked, and shows you the diff. It never applies anything silently.
