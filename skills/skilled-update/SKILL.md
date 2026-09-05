---
name: skilled-update
description: Check whether any skill here has changed upstream, and review what changed before deciding whether to fold it in.
disable-model-invocation: true
---

# Skilled Update

26 of the 38 skills in this repo were ported from [mattpocock/skills](https://github.com/mattpocock/skills), then renamed and, in several cases, rewritten. Each carries its provenance in frontmatter:

```yaml
metadata:
  upstream:
    repo: https://github.com/mattpocock/skills
    path: skills/engineering/tdd/SKILL.md
    commit: 3cca18b368ae95cdbdebbff572ccafa662551015
```

This skill does not silently overwrite anything. Upstream's content is not ours to reapply blind: names differ, cross-references were retargeted, and several skills were rewritten rather than copied. What this does is tell you **what changed upstream since we forked**, and leave the decision of whether and how to fold it in to whoever invokes it.

The 12 skills with no `metadata.upstream` field (`simple-first`, `design-principles`, `module-design`, `readable-code`, `background-jobs`, `database-performance`, `observability`, `implement`, `requirements-interview`, `clarify-requirements`, `skilled`, `skilled-setup`) are either wholly original or rewritten heavily enough that a diff against upstream would be noise, not signal. Skip them.

## Process

### 1. Get upstream's current state

```bash
git clone --depth 1 https://github.com/mattpocock/skills /tmp/skilled-upstream-check
```

If a fuller history is needed for step 2 (a shallow clone only has the tip), instead:

```bash
git clone https://github.com/mattpocock/skills /tmp/skilled-upstream-check
```

### 2. For each tracked skill, check for drift

Read every `skills/*/SKILL.md` in this repo, collect the `metadata.upstream` block where present, and for each one:

```bash
git -C /tmp/skilled-upstream-check log --oneline <recorded-commit>..HEAD -- <path>
```

Empty output means upstream hasn't touched that file since the recorded commit: up to date, nothing to do.

Non-empty output means it changed. Get the diff:

```bash
git -C /tmp/skilled-upstream-check diff <recorded-commit> HEAD -- <path>
```

### 3. Report, don't apply

For every skill with drift, show:

- Its name here, and the upstream path
- The commit list from step 2 (what changed, one line each)
- The diff

Group the report by how the skill was derived, since that determines how hard folding it in will be:

- **Renamed only** (frontmatter `name` and internal cross-references changed, body otherwise intact): the diff usually applies close to as-is. Show it, and if the user agrees, apply it and update `commit` to upstream's new HEAD sha.
- **Renamed and edited** (we added or changed sections beyond the rename, e.g. `tdd` gained a `CONTEXT.md`-reading step, `module-design` gained the SOLID section): a raw patch will conflict with our edits. Say so explicitly, quote the relevant hunk, and let whoever invoked this decide how to merge it by hand.

Never edit a `SKILL.md` as part of this step without the change being confirmed. Reporting is the deliverable; applying is a separate, explicit choice.

### 4. On confirmed apply

Update only the `commit:` field in that skill's `metadata.upstream` block to the new upstream HEAD sha. Do not touch `path` or `repo`. Re-run `tests/validate_skills.py` afterward.

### 5. Clean up

Remove `/tmp/skilled-upstream-check` when done.

## Adding provenance to a new port

When a future skill is ported from upstream by copying its file (not rewriting it), add the same `metadata.upstream` block by hand, with `commit` set to upstream's HEAD sha at the moment of copying. A skill written fresh, even if upstream-inspired, gets no block: tracking would flag it as 100% drifted on every run for no useful signal.
