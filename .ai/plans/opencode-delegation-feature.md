# Feature: optional, toggleable, Claude-Code-only opencode worker-team delegation

## Objective & context

Port the personal "orchestrator delegates to opencode subagents" workflow (currently
living only in this user's `~/.claude/commands/oc*.md` and `~/.claude/CLAUDE.md`)
into the `skilled` repo as a distributable, opt-in add-on: install it into any
project via `install.sh`, Claude Code only, default OFF, flip on/off with one
settings key.

## Current state (evidence)

- `skilled`'s only distribution unit today is `skills/*/SKILL.md` (Agent Skills
  standard), installed via `install.sh` into `.claude/skills`, `.agents/skills`,
  or `opencode.json`'s `skills.paths` (install.sh:32-64, CONVENTIONS.md:33).
  `install.sh` has zero awareness of `.claude/commands/` or `.opencode/agent/`.
- The personal implementation is 7 Claude Code **custom slash commands**
  (`~/.claude/commands/{oc,ocresearch,ocplan,ocverify,ocreview,ocbug,ocimpl}.md`),
  a distinct Claude Code mechanism from Agent Skills (own frontmatter:
  `description`, `allowed-tools`; body uses `$ARGUMENTS`). Just fixed this
  session to route every subagent call through `--agent orchestrator` +
  `run_in_background: true`.
- The 6 opencode agent personas it depends on
  (`orchestrator/researcher/implementer/verifier/bug-catcher/bug-reviewer`)
  live in `~/.config/opencode/agent/*.md` — opencode's **global** agent
  directory for this user. opencode also supports a **project-local**
  `<project>/.opencode/agent/*.md` (confirmed: `skilled/.opencode/agent/`
  already exists, empty, created earlier today, and is NOT covered by
  `.opencode/.gitignore` — only `node_modules/package*.json/bun.lock` are
  ignored there, so committing `.md` files under it is safe).
- The model/provider wiring (`agentrouter` baseURL, `vertexai` API key) lives
  in `~/.config/opencode/opencode.json` — this is per-user secret-adjacent
  config, never something `skilled` should distribute. The 6 agent `.md` files
  only reference model **names** as strings (e.g. `agentrouter/gpt-5.6-sol`);
  they don't embed credentials.
- CONVENTIONS.md documents there is **no** Agent Skills frontmatter field that
  restricts a skill to one harness ("no portable fix" — CONVENTIONS.md:37-39
  region). Confirms harness restriction must happen at the distribution layer
  (install.sh choosing what to copy where), not inside a SKILL.md.

## Change list

New top-level source directory (sibling to `skills/`, not itself an Agent
Skill, since it is intentionally non-portable):

```
opencode-delegation/
  commands/oc.md              (+ ocresearch/ocplan/ocverify/ocreview/ocbug/ocimpl.md)
  agents/orchestrator.md      (+ researcher/implementer/verifier/bug-catcher/bug-reviewer.md)
  CLAUDE.fragment.md
```

1. **`opencode-delegation/commands/*.md`** — the 7 command files, ported
   verbatim from the now-fixed personal versions (already route through
   `--agent orchestrator`, already use `run_in_background`). Each gets one
   new first step prepended: *"Read `.claude/settings.json`. If
   `skilledOpencodeDelegation` is not `true`, tell the user this add-on is
   off (`.claude/settings.json` → `"skilledOpencodeDelegation": true` to
   enable) and stop."* This is the actual on/off switch — cheap, human-
   editable, no reinstall needed to flip it.

2. **`opencode-delegation/agents/*.md`** — the 6 agent persona files, copied
   from `~/.config/opencode/agent/*.md` verbatim (model names only, no
   provider/credential config).

3. **`opencode-delegation/CLAUDE.fragment.md`** — condensed worker-team
   table + delegation workflow + rules (trimmed version of the personal
   `~/.claude/CLAUDE.md` policy), explicitly scoped: *"only applies when
   `skilledOpencodeDelegation: true`."* This is the "project-level md" piece
   — it lives in the target project's own `CLAUDE.md`, never touches anyone's
   global one.

4. **`install.sh`** — new flag `--opencode-delegation`, independent of
   `--claude/--opencode/--antigravity` (it never installs into `.agents/` or
   registers with `opencode.json`'s `skills.paths` — it is Claude Code's
   commands dir + opencode's *own* project-local agent dir, nothing to do
   with the skill-portability mechanism):
   - Symlink (default) or copy (`--vendor`, matching existing convention) —
     `commands/*.md` → `<project>/.claude/commands/*.md`
     `agents/*.md` → `<project>/.opencode/agent/*.md`
   - Merge `CLAUDE.fragment.md` into `<project>/CLAUDE.md` between
     `<!-- skilled:opencode-delegation:start -->` / `:end` markers (idempotent
     re-run, matches how the script already avoids clobbering on other paths).
   - Write `"skilledOpencodeDelegation": false` into `<project>/.claude/settings.json`
     if the key is absent (default **off** — shared repo, don't make someone's
     Claude Code silently shell out to a CLI they may not have configured).
   - `--uninstall --opencode-delegation`: remove the symlinks/vendored files,
     strip the CLAUDE.md block by markers, remove the settings key.

5. **README.md** — new short section: what this add-on is, prerequisite
   (`opencode` CLI + a working `agentrouter`/model provider already
   configured — skilled does not install or configure opencode itself),
   how to install/enable/disable.

## Blast radius

- `install.sh` only: new flag branch, no change to existing `--claude/
  --opencode/--antigravity/--vendor/--uninstall` code paths for skills.
- No change to any file under `skills/`.
- `tests/validate_skills.py` doesn't scan `commands/` or `agents/` today and
  doesn't need to — these aren't SKILL.md files, so the existing skill
  validator's invariants (frontmatter fields, cross-skill dependency rules)
  don't apply. Leaving it unmodified is correct, not a gap.
- README.md gains a section; CONVENTIONS.md unchanged (it governs skill
  authoring, and this isn't a skill).

## Options considered

1. **Ship as a user-invoked SKILL.md instead of custom commands.** Rejected:
   the feature is fundamentally non-portable (shells out to `opencode`,
   Claude-Code-only by requirement), and CONVENTIONS.md is explicit there's
   no frontmatter field to enforce that restriction — forcing it into the
   Agent Skills format would be the "no portable fix" workaround the
   conventions doc says not to do.
2. **Default the toggle ON after install.** Rejected: this is a shared repo
   other people install into their own projects; opt-in-off-by-default avoids
   surprising someone with an external CLI dependency they haven't set up.
3. **Skip shipping the opencode `agent/*.md` personas, assume the installer
   already has them globally (like this user does today).** Rejected: makes
   the feature silently broken for anyone who doesn't already have this
   user's personal opencode config — shipping the project-local copies makes
   installs self-contained. **Picked**: ship them, install to
   `.opencode/agent/`.

## Risks & mitigations

- **External dependency (`opencode` CLI + provider config) not installable by
  `skilled`.** Mitigation: document as a hard prerequisite in README; the
  settings toggle defaults off so an unconfigured environment stays inert
  until the user deliberately turns it on.
- **CLAUDE.md merge could duplicate on repeated installs.** Mitigation: marker
  comments make the merge idempotent (replace between markers, not append).
- **Drift between installed commands and any future personal-workflow fixes.**
  Same problem every vendored skill already has; `skilled-update` skill's
  diff-and-show pattern is the existing precedent, not something to solve
  net-new here.

## Verification plan

1. `./install.sh /tmp/scratch-project --opencode-delegation` (or as an add-on
   to a `--claude` install) into a throwaway project; confirm
   `.claude/commands/oc*.md` and `.opencode/agent/*.md` land, `CLAUDE.md`
   fragment appears between markers, `.claude/settings.json` gets
   `"skilledOpencodeDelegation": false`.
2. Flip the flag to `true`, confirm a command's first-step check reads it
   correctly (inspect the resulting prompt logic, not a live opencode run —
   no network/CLI dependency in the test itself).
3. Re-run install, confirm no duplicate CLAUDE.md block, no duplicate
   settings key.
4. `--uninstall --opencode-delegation`, confirm full cleanup.
5. Confirm `--antigravity` / `--opencode` alone (no `--opencode-delegation`
   flag) never installs any of this.
