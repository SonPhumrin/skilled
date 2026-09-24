---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", wants integration tests, or needs to change untested code safely.
---

# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Ask: "What's the public interface, and which seams should we test?"

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), call the Skill tool with "module-design" for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.

## Untested code: characterize first

When the code you need to change has no tests at the seam, you cannot run red → green against it yet: there is nothing to tell you whether the change broke something else. Before changing it, pin what it **does today**, not what it should do:

1. Write a test at the seam that asserts a deliberately wrong value, run it, and copy the actual output into the assertion. Repeat for each behaviour next to the change, including the odd ones: current behaviour is the oracle, bugs included.
2. If the code can't be reached from a seam without editing it, make the smallest edit that creates one (extract a function, pass a dependency in) and nothing else in that step.
3. Commit the characterization tests on their own, green, before any behaviour change. Then run the normal loop for the change itself.

Keep refactoring and behaviour change in separate commits. A commit that does both can't be checked against the characterization tests: when one goes red, nothing says which half broke it.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **The test is the oracle, not an obstacle.** When a test fails, the implementation is what changes. If the test itself looks wrong, stop and surface it — what it asserts, why you believe that is wrong, and what the correct behaviour is — then wait for the user's call. Editing the assertion to reach green verifies nothing, and a weakened test is worse than a red one.
- **Refactoring is not part of the loop.** It belongs to the review stage (see the `review-diff` skill), not the red → green implementation cycle.
