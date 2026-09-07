---
name: code-craft
description: The senior-engineer judgment ladder - how much to build, which design principle applies, how to name and shape code, and how to design background jobs, queries, and migrations. Use when deciding whether to add an abstraction, a queue, a cache, or a dependency; when two designs are in play; when writing or refactoring any function; when picking names; when adding a job, worker, or scheduled task; when writing a query or migration, adding an index, or paginating; when an endpoint is slow or a job runs twice or fails silently; or when code feels tangled, fragile, or over-engineered.
---

# Code Craft

The instinct a senior engineer applies without narrating it: a small, continuous tax paid on design as the code is written, instead of a hack now and a rewrite once it hurts. Ousterhout calls the two modes **strategic** and **tactical** programming — tactical ships the next feature fastest and pays for it in the next twenty; strategic spends a little more now so the next change is also fast. Everything below is that tax, made explicit enough to apply on purpose.

Strategic is not the same as elaborate. A rule with no stated cost turns into cargo cult, which is over-engineering wearing a nicer shirt, and cargo cult is tactical programming with extra steps.

Five rungs, top to bottom. Each links to a reference file in this skill's `reference/` folder, with the full mechanism-level detail — read only the one the situation actually calls for, not all five every time.

For interface shape, seams, and SOLID, call the Skill tool with "module-design" — module-level, one rung more specific than anything here. For what to log, measure, and trace, call it with "observability".

## 1. How much to build

The default answer to added complexity is **no**. It earns its place by pointing at a real constraint or a third repetition, never at a future that might arrive. Before writing an abstraction, run the **deletion test**: inline its body at every call site — if the complexity vanishes, it was a pass-through; if it reappears across N sites, it earned its keep.

Read `reference/how-much-to-build.md` when: proposing infrastructure (a queue, a cache, a new service, a dependency), reviewing your own abstraction before committing to it, or the user says something feels over-engineered.

## 2. Which principle applies

Cohesion and coupling, Law of Demeter, command-query separation, composition over inheritance, illegal states made unrepresentable, fail fast at the boundary, explicit over implicit. Each states the failure it prevents and the cost of pushing it too far.

Read `reference/design-principles.md` when: two designs are in play and you need to name what actually separates them, or code feels tangled or fragile and you need to name why.

## 3. Naming and function shape

Names state intent, not mechanism. Guard clauses over nesting. Nesting past three levels is the refactor signal. Comment the why, never the what.

Read `reference/naming-and-shape.md` when: writing or refactoring any function, picking a name, or a function has grown past a screen or nests deeply.

## 4. Async and background jobs

Async is infrastructure and defaults to no. Anything that can run more than once (a retry, at-least-once delivery) must be idempotent by a named mechanism — that's not optional, it's the normal operating condition, not an edge case. Classify a failure before retrying it, and give retries a budget: a chain retrying at every layer multiplies, it doesn't add. A job and its side effect that must both happen or neither need one transaction, not two separate steps that can fail apart.

Read `reference/async-and-jobs.md` when: adding a job, worker, or scheduled task; writing or changing a job handler; deciding whether work should be async at all; a job runs twice, gets stuck, or fails silently.

## 5. Data and query design

Measure before touching a schema or adding an index — the query plan, not intuition. A query inside a loop (N+1) is the most common bug in this space. Pagination that walks and discards rows degrades with depth; keyset pagination doesn't. Transactions are short and never held across a network call.

Read `reference/data-and-queries.md` when: writing a query or migration; an endpoint or page is slow; adding an index; working with an ORM that loads related records; paginating; the database is the suspected bottleneck.

## Using this

State which rung a decision actually sits on before applying its rule — "how much to build," "which principle," "how it's shaped," "how a job survives failure," and "how the data layer holds up" are different questions, and answering the wrong one is how a naming argument turns into a debate about whether the feature should exist at all.
