---
name: implement
description: Build the work described by a spec or set of tickets, test-first at agreed seams, reviewed before commit.
disable-model-invocation: true
---

Build the work the user pointed you at: a spec, a ticket, or a set of tickets.

## Before writing code

Read what the project already tells you, and say what you found:

- `CONTEXT.md` for the vocabulary. Names in the code match it.
- `ARCHITECTURE.md` for **Constraints** and **Non-goals**. If the work needs something listed as a non-goal, stop and raise it with the user before building.
- Any ADR under `docs/adr/` covering the area you are touching.

Agree the **seams** you will test at, and get the user to confirm them. This is the one decision that shapes everything after it, so make it explicitly rather than discovering it as you go.

If anything in the spec is still ambiguous at this point, call the Skill tool with "requirements-interview" rather than guessing. A wrong assumption caught now costs a question; caught after the build it costs the build.

## Building

Work in vertical slices, one behaviour at a time. At each agreed seam, call the Skill tool with "tdd" and run the red-green loop for that slice.

The design skills are model-invoked, so they will fire on their own as the work warrants. Reach for one deliberately when you are about to commit to a shape: "simple-first" before adding infrastructure or an abstraction, "module-design" when defining an interface, "background-jobs" for anything running outside the request cycle, "database-performance" for a new query or migration.

Run typechecking after each slice and the relevant test file with it. Run the full suite once, at the end.

## Closing out

Call the Skill tool with "review-diff" against the point you started from. Work its findings before committing, and say which findings you accepted and which you are leaving, with the reason.

Commit to the current branch. The commit message says what changed and why, and references the ticket or spec.

Done means: every slice in the spec built, the full suite green, review findings resolved or explicitly deferred, and committed. Report anything you did not build and why.
