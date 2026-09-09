---
name: domain-interview
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

Call the Skill tool twice, for "requirements-interview" and "domain-modeling".

Both end in a proposal awaiting the user's explicit confirmation, not an implicit green light. Once confirmed, don't start editing files directly: route through `skilled`'s main flow, applying the decision tree in `skills/skilled/SKILL.md` step 3.

Name the **whole chain**, not just the first hop, so the user is confirming a destination rather than one step toward an unstated one:

- Single-session change → `/implement` directly.
- Multi-session build, one vertical slice → `/write-spec` → `/implement`.
- Multi-session build that splits into several tracer-bullet tickets → `/write-spec` → `/write-tickets` → `/implement` per ticket (staying in the loop) or `/implement-spec` for the whole graph in one PR (wide, parallelizable, no per-ticket review).

State which chain this task lands in and why in one line, then wait for the user to confirm or redirect before naming the first skill to actually run.
