---
name: skilled-setup
description: Configure this repository for the skilled skills - issue tracker, triage labels, and the CONTEXT / ARCHITECTURE / ADR documents. Run once per repo.
disable-model-invocation: true
---

# Skilled Setup

Scaffold the per-repo configuration the other skills assume:

- **Project documents**: `CONTEXT.md` (domain language) and `ARCHITECTURE.md` (runtime shape, constraints, non-goals), plus where ADRs live
- **Issue tracker**: where issues live, so `write-tickets`, `write-spec`, and `triage` know what to call
- **Triage labels**: the strings behind the five canonical triage roles

Prompt-driven, not a script. Explore, present what you found, confirm, then write.

## 1. Explore

Read the repo. Assume nothing:

- `git remote -v`: is this GitHub, GitLab, or neither?
- `AGENTS.md` and `CLAUDE.md` at the root: does either exist, and does either already carry an `## Agent skills` section?
- `CONTEXT.md`, `ARCHITECTURE.md`, `docs/adr/`, `docs/agents/`: does prior output already exist?
- `.scratch/`: a sign a local-markdown tracker convention is already in use
- Is the `triage` skill installed? This decides whether section C runs at all.
- **The system itself**, because you are drafting `ARCHITECTURE.md` from it: entry points, the dependency manifest, `docker-compose.yml` or equivalent, migrations or schema files, anything that looks like a worker or job definition, and the test setup. Note what the datastore actually is and whether anything runs outside the request cycle.

## 2. Present findings, then ask

Summarise what is present and what is missing. Then take the sections in order, one at a time.

Lead each section with the recommended answer so the user can accept it in a word. Give a one-line explainer only where the choice genuinely branches, and skip a section entirely when exploration already settled it.

**Section A: project documents.** Not a question about layout, a question about content. Draft both files **filled in from what you found in step 1**, never as blank templates:

- `CONTEXT.md` from [context-template.md](context-template.md): seed the Language section with the terms that actually recur in the codebase, each with your best definition. Mark the ones you are guessing at.
- `ARCHITECTURE.md` from [architecture-template.md](architecture-template.md): fill Shape, Data stores, Async work, and External integrations from the code. Leave **Constraints** and **Non-goals** as questions for the user, since neither is discoverable from source and both are the sections the other skills lean on hardest.

Ask the user for exactly two things here: the constraints that are real (scale, latency budget, team, availability), and the non-goals. If they have none in mind, ask what the system is deliberately *not* for. An empty Non-goals section is a missed opportunity, not a neutral default.

Also copy [adr-template.md](adr-template.md) to `docs/adr/0000-template.md`.

**Section B: issue tracker.** Where issues live. `write-tickets`, `triage`, and `write-spec` read from and write to it, and need to know whether to call `gh issue create`, write a file under `.scratch/`, or follow a workflow you describe.

If a remote points at GitHub, propose GitHub. If GitLab, propose GitLab. Otherwise offer:

- **GitHub**: GitHub Issues, via the `gh` CLI
- **GitLab**: GitLab Issues, via the `glab` CLI
- **Local markdown**: files under `.scratch/<feature>/`, good for solo projects and repos with no remote
- **Other** (Jira, Linear, and so on): ask for a one-paragraph description of the workflow and record it as prose

Record the choice in `docs/agents/issue-tracker.md` from the matching seed: [issue-tracker-github.md](issue-tracker-github.md), [issue-tracker-gitlab.md](issue-tracker-gitlab.md), [issue-tracker-local.md](issue-tracker-local.md). The GitHub and GitLab seeds carry a "PRs as a request surface" flag, defaulted off. Leave it off and do not raise it.

**Section C: triage labels.** Skip entirely if `triage` is not installed.

If it is, ask one question: keep the default labels? (recommended: yes). The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Collect overrides only if the user's tracker already uses other names, so `triage` applies existing labels rather than creating duplicates.

## 3. Confirm

Show drafts of everything you are about to write:

- `CONTEXT.md` and `ARCHITECTURE.md`, filled in
- The `## Agent skills` block for `CLAUDE.md` or `AGENTS.md`
- `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, and `docs/agents/triage-labels.md` (the last only when `triage` is installed)

Let the user edit before anything is written.

## 4. Write

**Pick the file to edit:**

- If `CLAUDE.md` exists, edit it.
- Otherwise if `AGENTS.md` exists, edit it.
- If neither exists, ask which to create. Do not pick for them.

Never create `AGENTS.md` when `CLAUDE.md` exists, or the reverse. If an `## Agent skills` block is already there, update it in place rather than appending a duplicate, and leave the surrounding sections alone.

The block:

```markdown
## Agent skills

### Project documents

Domain language in `CONTEXT.md`. Runtime shape, constraints, and non-goals in `ARCHITECTURE.md`. Decisions in `docs/adr/`. Read all three before designing anything.

### Issue tracker

[one-line summary]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary]. See `docs/agents/triage-labels.md`.

### Domain docs

[single-context or multi-context]. See `docs/agents/domain.md`.
```

Include the triage sub-block, and write `docs/agents/triage-labels.md`, only when section C ran.

Then write the files, using [domain.md](domain.md) for the domain consumer rules and the seeds named above for the rest. For an "other" issue tracker, write `docs/agents/issue-tracker.md` from scratch using the user's description.

## 5. Done

Tell the user which skills now read these files, and that `docs/agents/*.md` can be edited directly later. Re-running this skill is only needed to switch issue trackers or start over.

Say plainly which parts of `ARCHITECTURE.md` are still guesses, so they know what to correct.
