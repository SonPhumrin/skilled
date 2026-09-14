---
name: implement-spec
description: Implement a whole spec on one branch: works the tickets as a task graph, running implementer subagents across the ready frontier, and lands one PR.
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The goal is a PR which implements the entire spec on a single branch.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for **maximum concurrency**.

## Steps

1. Read the spec and tickets. Read enough to understand the task graph.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo, accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration.

3. Create a branch, and a draft PR. The PR should be marked as 'closing' the spec issue and tickets.

4. Use **implementer subagents** to implement each ticket. Each implementer subagent should work in its own worktree, on its own branch.

5. Once an **implementer subagent** completes, merge its work to the PR branch with a **merger subagent**.

6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

7. Once all tickets are complete, call the Skill tool with "review-diff" against the PR branch. Fix all issues raised by the code review in a single **implementer subagent**.

8. Run the full test suite and typecheck against the final merged PR branch state — not per-slice, per-ticket, or per-worktree. Per-ticket runs only proved each piece worked in isolation; this is the first point anything proves the *merged whole* still works. If the fix pass in step 7 produced another commit, re-run this step once more against the new HEAD before moving on. A failure here is not a review finding to note and move past — loop back to a fix and re-run until it's green.

9. Mark the PR as ready for review.

10. Clean up all **implementer subagent** worktrees.
