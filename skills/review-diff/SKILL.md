---
name: review-diff
description: "Review changes since a fixed point (commit, branch, tag, or merge-base) on two axes, Standards and Spec, in parallel sub-agents reported side by side. Use when the user wants a branch, PR, or work in progress reviewed, or asks to \"review since X\"."
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

The issue tracker should have been provided to you. If `docs/agents/issue-tracker.md` is missing, tell the user to run `/skilled-setup`.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

**This is a committed-tree diff only — it never sees uncommitted work.** Check `git status --porcelain`. If it's non-empty, the fixed-point diff alone understates what's actually changed: the common single-ticket path is implement → review → commit, meaning at review time the real changes are still staged/unstaged/untracked, not yet on `HEAD`. When the working tree is dirty, union in:

- `git diff HEAD` (unstaged changes against the last commit)
- `git diff --cached` (staged changes)
- `git ls-files --others --exclude-standard` (untracked files, read directly — they're in neither diff)

into what gets reviewed, and say so explicitly in the final report's header: which of committed / staged / unstaged / untracked was included. A clean working tree needs none of this — the three-dot diff alone is already everything.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and that there's something to review (the three-dot diff is non-empty, or the working tree is dirty). A bad ref, or both an empty diff and a clean tree, should fail here, not inside two parallel sub-agents.

Then list every changed test file. **Test changes are a finding until proven otherwise**: an agent reaching green by editing the assertion has verified nothing, and a weakened test is worse than a red one. For each changed test file, state whether the change adds coverage, or relaxes an assertion, deletes a case, or skips a test. A relaxation with no corresponding behaviour change elsewhere in the diff is a hard finding, not a judgement call. Report these before the two sub-agents run, so they can't be absorbed into an axis.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

Also collect, when they exist:

- `ARCHITECTURE.md`, specifically its **Constraints** and **Non-goals**. A diff that builds something listed as a non-goal is a change of direction and is the single most important thing this review can catch.
- Any ADR under `docs/adr/` touching the changed area. A diff that reverses an accepted decision without superseding its ADR is a finding.
- `CONTEXT.md`, so naming in the diff can be checked against the project's own vocabulary.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

**Standards sub-agent prompt** should include:

- The full set of changes captured in step 1 (the diff command and commit list, plus the staged/unstaged/untracked union if the working tree was dirty).
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it), plus the `ARCHITECTURE.md` Non-goals and any relevant ADR, quoted.
- An instruction to consult the design skills where the diff warrants it: call the Skill tool with "code-craft" for anything newly added, a new job or queue consumer, or a new query or migration, and with "module-design" for a new or changed interface. One call per skill, only for the skills the diff actually touches.
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); (b) any baseline smell you spot: name it and quote the hunk; and (c) anything the diff builds that `ARCHITECTURE.md` lists as a non-goal or that an accepted ADR decided against, quoting the line. Account for every changed file, so say which files you found nothing in. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** should include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

If the diff touches a schema or migration, environment or deploy config, a public API, or a feature flag, add to the Standards brief: "Call the Skill tool with "release-safety" and report each of its checks the diff fails."

If the harness offers a reviewer on a **different model provider** than the one that wrote the code, run the Spec sub-agent there for diffs touching auth, data, money, or migrations: a different model family catches bugs the author's own family endorses. It roughly doubles review cost, so not for routine diffs.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
