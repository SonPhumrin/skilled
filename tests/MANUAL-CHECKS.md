# Manual checks

`validate_skills.py` catches everything checkable from disk: frontmatter, naming,
cross-references, install state, single-source-of-truth. It cannot check whether
a skill actually *fires* when it should, because that only happens inside a live
agent session. Run these by hand after any change to a `description` field, and
whenever adding a new harness.

## Auto-invocation, per harness

Open a fresh session in each harness you use and try the matching prompt. A miss
means the `description` wording is the bug — sharpen the trigger phrasing, don't
inline the material into another skill.

| Prompt | Should reach |
| :--- | :--- |
| "add a background job to email receipts" | `code-craft` |
| "this endpoint is slow" | `code-craft` |
| "add a plugin system for report formats" | `code-craft` (pushes back) |
| "clean up this function" | `code-craft` |
| "is this the right abstraction?" | `code-craft` + `module-design` |
| "how would I know if this broke in prod?" | `observability` |
| "check this in the browser, does the new screen work?" | `verify-in-browser` |
| "the migration adds a NOT NULL column, is the backfill safe?" (no UI) | *not* `verify-in-browser` |

**Claude Code**: `claude` in any directory, ask the prompt directly.
**OpenCode**: `opencode`, same prompts. Confirm the skill also appears via `/skills`.
**Antigravity CLI**: `antigravity`, same prompts. Confirm via `/skills`.

## Per-harness install sanity

Run `./install.sh /path/to/project` first, then check inside that project:

- **Claude Code**: `/skills` lists all 37; the 23 user-invoked ones are absent
  from auto-invocation but reachable by typing `/<name>`.
- **OpenCode**: has no project-level directory scan — its own embedded docs
  say external-skill auto-load only covers the *global* `~/.claude/` and
  `~/.agents/`, never a project's. `install.sh` instead writes a
  `"skills": {"paths": [...]}` entry to the project's `opencode.json`
  pointing straight at this repo's `skills/` dir; confirm that entry is
  present and that `opencode.json` has no
  `"permission": {"skill": {...: "deny"}}` entry blocking one of them.
- **Antigravity**: reads `.agents/skills/` at the project level, but its own
  logs have shown that scan going stale on a symlinked folder ("Slash
  commands unchanged, skipping update" even after a real change). `install.sh`
  also writes `.agents/skills.json` (Antigravity's own documented mechanism
  for skills outside its default discovery locations) as a belt-and-suspenders
  fix; confirm it's present and points at this repo's `skills/` dir. Because
  Antigravity ignores `disable-model-invocation`, **all 37** are
  model-selectable there, including the 23 meant to be user-only elsewhere.
  That's a real gap between harnesses, not a bug in this repo — there is no
  portable "user-only" field in the open Agent Skills spec today.
- Verify the install itself with `python3 tests/validate_skills.py --project /path/to/project`.

## Setup skill, end to end

Run `/skilled-setup` (Claude Code) or the equivalent invocation in the other
harnesses, inside a real repo with existing `CLAUDE.md`/`AGENTS.md` and `docs/`
(`Cubis Foundry` is a good target). Confirm it:

- drafts `CONTEXT.md` and `ARCHITECTURE.md` filled in from what it found, not blank
- asks before writing anything
- edits the existing `CLAUDE.md` rather than creating a competing `AGENTS.md`

## After renaming or adding a skill

- `./install.sh` re-run, so every global location picks up the change
- `python3 tests/validate_skills.py` passes
- grep the whole `skills/` tree for the old name, in case a cross-reference was missed
