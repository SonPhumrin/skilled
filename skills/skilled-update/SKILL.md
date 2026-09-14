---
name: skilled-update
description: Check whether any skill here has changed upstream, and review what changed before deciding whether to fold it in.
disable-model-invocation: true
---

# Skilled Update

30 of the 37 skills in this repo were ported from [mattpocock/skills](https://github.com/mattpocock/skills), then renamed and, in several cases, rewritten. Their provenance lives in this skill's own [upstream-map.md](upstream-map.md), not in each skill's frontmatter — that file is the only thing that reads it, so keeping it there costs zero tokens on every other skill's fire.

This skill does not silently overwrite anything. Upstream's content is not ours to reapply blind: names differ, cross-references were retargeted, and several skills were rewritten rather than copied. What this does is tell you **what changed upstream since we forked**, and leave the decision of whether and how to fold it in to whoever invokes it.

The 7 skills with no row in `upstream-map.md` are either wholly original or rewritten heavily enough that a diff against upstream would be noise, not signal. Skip them; the map file itself names them.

## Process

### 1. Get upstream's current state

Clone into a fresh, unique directory (never a fixed path) so a concurrent or interrupted prior run can't collide with or clobber this one:

```bash
UPSTREAM_CHECKOUT="$(mktemp -d -t skilled-upstream-check.XXXXXX)"
git clone --depth 1 https://github.com/mattpocock/skills "$UPSTREAM_CHECKOUT"
```

Check the exit status. A nonzero exit (network failure, repo moved, etc.) means the check couldn't run at all — report that plainly and stop; never proceed as if upstream were unchanged.

If a fuller history is needed for step 2 (a shallow clone only has the tip), instead:

```bash
git clone https://github.com/mattpocock/skills "$UPSTREAM_CHECKOUT"
```

### 2. For each tracked skill, check for drift

Read [upstream-map.md](upstream-map.md) and for each row (skill name, upstream path, forked-at commit). Derive the skill's **containing directory** from the path (strip the trailing `/SKILL.md`) and watch that whole directory, not just the one file — upstream can add or change a supporting file (a `reference/*.md`, a script) without touching `SKILL.md` itself, and a file-only watch would call that "up to date" when it isn't:

```bash
git -C "$UPSTREAM_CHECKOUT" log --oneline <forked-at-commit>..HEAD -- <upstream-dir>
```

Check the exit status before reading the output. A nonzero exit — most often the recorded `<forked-at-commit>` no longer being reachable, which can happen once a shallow clone's HEAD has moved past it — means drift is **unknown**, not "up to date": report it as unknown and suggest a fuller clone (the non-shallow command from step 1), never fold it silently into "nothing to do." Only a **zero exit with empty output** means upstream hasn't touched that directory since the recorded commit.

Non-empty output means it changed. Get the diff:

```bash
git -C "$UPSTREAM_CHECKOUT" diff <forked-at-commit> HEAD -- <upstream-dir>
```

### 3. Report, don't apply

For every skill with drift, show:

- Its name here, and the upstream path
- The commit list from step 2 (what changed, one line each)
- The diff

Group the report by how the skill was derived, since that determines how hard folding it in will be:

- **Renamed only** (frontmatter `name` and internal cross-references changed, body otherwise intact): the diff usually applies close to as-is. Show it, and if the user agrees, apply it and update the commit in `upstream-map.md` to upstream's new HEAD sha.
- **Renamed and edited** (we added or changed sections beyond the rename, e.g. `tdd` gained a `CONTEXT.md`-reading step, `module-design` gained the SOLID section): a raw patch will conflict with our edits. Say so explicitly, quote the relevant hunk, and let whoever invoked this decide how to merge it by hand.

Never edit a `SKILL.md` as part of this step without the change being confirmed. Reporting is the deliverable; applying is a separate, explicit choice.

### 4. On confirmed apply

Update only that row's commit in `upstream-map.md` to the new upstream HEAD sha. Do not touch the path. Re-run `tests/validate_skills.py` afterward.

### 5. Clean up

Remove `"$UPSTREAM_CHECKOUT"` when done.

## Adding provenance to a new port

When a future skill is ported from upstream by copying its file (not rewriting it), add a row to `upstream-map.md` by hand: skill name, upstream path, and upstream's HEAD sha at the moment of copying. A skill written fresh, even if upstream-inspired, gets no row: tracking would flag it as 100% drifted on every run for no useful signal.
