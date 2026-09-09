---
name: code-craft
description: The senior-engineer judgment ladder - how much to build, which design principle applies, naming and function shape, jobs/queries/migrations, and performance/concurrency/security. Use when deciding whether to add an abstraction, queue, cache, or dependency; writing or refactoring any function; adding a job or scheduled task; writing a query, migration, or index; code runs in a hot path or a loop over user input; two requests might touch the same state; building a query/command/path from untrusted input; or code feels tangled, fragile, slow, or over-engineered.
---

# Code Craft

The instinct a senior engineer applies without narrating it: a small, continuous tax paid on design as the code is written, instead of a hack now and a rewrite once it hurts. Ousterhout calls the two modes **strategic** and **tactical** programming — tactical ships the next feature fastest and pays for it in the next twenty; strategic spends a little more now so the next change is also fast. Everything below is that tax, made explicit enough to apply on purpose.

Strategic is not the same as elaborate. A rule with no stated cost turns into cargo cult, which is over-engineering wearing a nicer shirt, and cargo cult is tactical programming with extra steps.

Seven rungs, top to bottom. Each links to a reference file in this skill's `reference/` folder, with the full mechanism-level detail — read only the one the situation actually calls for, not all seven every time.

For interface shape, seams, and SOLID, call the Skill tool with "module-design" — module-level, one rung more specific than anything here. For what to log, measure, and trace, call it with "observability".

## 1. How much to build

Complexity earns its place by pointing at a real constraint or a third repetition, never a future that might arrive. Run the **deletion test** before committing to an abstraction: inline it at every call site — if the complexity vanishes, it was a pass-through.

Read `reference/how-much-to-build.md` when: proposing infrastructure (a queue, a cache, a new service, a dependency), reviewing your own abstraction before committing to it, or the user says something feels over-engineered.

## 2. Which principle applies

Cohesion/coupling, Law of Demeter, command-query separation, composition over inheritance, illegal states unrepresentable, fail fast at the boundary, explicit over implicit — each names the failure it prevents and the cost of overapplying it.

Read `reference/design-principles.md` when: two designs are in play and you need to name what actually separates them, or code feels tangled or fragile and you need to name why.

## 3. Naming and function shape

Names state intent, not mechanism. Guard clauses over nesting; past three levels deep is the refactor signal. Comment the why, never the what.

Read `reference/naming-and-shape.md` when: writing or refactoring any function, picking a name, or a function has grown past a screen or nests deeply.

## 4. Async and background jobs

Async is infrastructure and defaults to no. Anything that can run more than once must be idempotent by a named mechanism — that's the normal operating condition, not an edge case — and retries need a budget, since a chain retrying at every layer multiplies.

Read `reference/async-and-jobs.md` when: adding a job, worker, or scheduled task; writing or changing a job handler; deciding whether work should be async at all; a job runs twice, gets stuck, or fails silently.

## 5. Data and query design

Measure the query plan before touching a schema or adding an index, not intuition. A query inside a loop (N+1) and pagination that degrades with depth are the two most common ways this gets skipped.

Read `reference/data-and-queries.md` when: writing a query or migration; an endpoint or page is slow; adding an index; working with an ORM that loads related records; paginating; the database is the suspected bottleneck.

## 6. Performance and concurrency

Name the complexity class before optimizing — most "make it faster" requests are really "get out of the wrong complexity class." Only code that runs in a hot path or a loop over user input needs this scrutiny. Every piece of shared mutable state needs a named protection — a lock, a database row lock, an atomic operation, or immutability; "it probably won't happen" is not one.

Read `reference/performance-and-concurrency.md` when: code runs per-request or in a loop over user-controlled input; two things might touch the same state at once; a profiler or incident points here; before reaching for a lock, a queue, or a "this should be rare" comment.

## 7. Security by default

The same fail-fast-at-the-boundary discipline from rung 2, aimed at an adversarial caller instead of a careless one. Never build a query, command, or path from untrusted input by concatenation, and authorization lives next to the data it guards — a login check at the route is not an ownership check at the resource.

Read `reference/security-by-default.md` when: touching anything that builds a query, command, or file path from external input; writing an error handler or log statement on a path that sees real user data; adding an endpoint, field, or resource that needs an owner check; accepting a new input format; anywhere "trusted" and "the caller" would appear in the same sentence.

## Using this

State which rung a decision actually sits on before applying its rule — "how much to build," "which principle," "how it's shaped," "how a job survives failure," "how the data layer holds up," "how it behaves under load or in parallel," and "what an adversarial caller could do with this" are different questions, and answering the wrong one is how a naming argument turns into a debate about whether the feature should exist at all.
