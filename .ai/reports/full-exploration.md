# skilled — full exploration report

Explored at HEAD `45e6a1c` (main, clean against `origin/main`), working tree dirty with uncommitted work (see [Repository state](#repository-state)).

---

## 1. What this is

`skilled` is a **distributable collection of Agent Skills** — plain `SKILL.md` files following the open [agentskills.io](https://agentskills.io) standard — for the software-building workflow: alignment before code, design discipline while writing it, review before it ships.

It is not an application. It is a **source-of-truth library** plus a **bash installer** that symlinks (or copies) those skills into whatever project you point it at, for three different AI coding harnesses.

| | |
| :--- | :--- |
| Origin | `https://github.com/SonPhumrin/skilled` |
| License | MIT, with explicit attribution to `mattpocock/skills` for derived portions (`LICENSE`) |
| Commits | 18, 2026-09-05 → 2026-09-09 |
| Size | 112 files, ~5.9k lines of Markdown |
| Skills | **37** (23 user-invoked, 14 model-invoked) |
| Validator | `python3 tests/validate_skills.py` → **PASSED: 0 errors, 0 warnings** |

## 2. Repository anatomy

```
skilled/
├── install.sh                 786 lines — the entire distribution mechanism
├── README.md                  303 lines — the user-facing manual
├── CONVENTIONS.md             67 lines  — the skill-authoring contract
├── CLAUDE.md                  = opencode-delegation/CLAUDE.fragment.md (merged)
├── LICENSE                    MIT + upstream attribution
├── skills/                    37 skill dirs, 70 files
├── opencode-delegation/       optional Claude-Code add-on (14 files)
│   ├── commands/oc*.md        7 slash commands
│   ├── agents/*.md            6 opencode worker personas
│   └── CLAUDE.fragment.md     the policy block merged into a project's CLAUDE.md
├── tests/                     validate_skills.py, run.sh, MANUAL-CHECKS.md, README.md
├── assets/                    7 hand-built SVGs for the README
└── .opencode/                 self-install artifacts: plans/, reports/, node_modules/
```

The `.opencode/node_modules/` tree (AI SDK packages) is an artifact of this repo installing its own add-on on itself, not a project dependency.

## 3. Architecture

### 3.1 The distribution model

One copy of each skill lives in `skills/`; `install.sh` **symlinks** it into a target project so a `git pull` here updates every project on that machine at once. `--vendor` swaps symlinks for real copies so a shared repo carries working skills without a second checkout — at the cost of going stale.

```
skilled/skills/*  ──install.sh /path/to/project──┬──▶ .claude/skills/      ──▶ Claude Code
                                                 ├──▶ .agents/skills/     ──▶ Antigravity CLI + IDE
                                                 │    .agents/skills.json
                                                 └──▶ opencode.json       ──▶ OpenCode
                                                      "skills": {"paths": [...]}
```

### 3.2 Why three different mechanisms

This is the most interesting design decision in the repo, and it's driven by real harness gaps documented in `install.sh`'s header (lines 31–68) and `CONVENTIONS.md`:

- **Claude Code** reads `.claude/skills/` natively. Straight symlink.
- **Antigravity** reads `.agents/skills/` natively, but its directory scan has been observed **going stale on a symlinked folder** ("Slash commands unchanged, skipping update"). So `install.sh` *also* writes `.agents/skills.json` — Antigravity's own documented external-registration format — as belt-and-suspenders, in both symlink and vendor mode.
- **OpenCode** has **no project-level directory scan at all**. Its own docs state external-skill auto-load only covers the *global* `~/.claude/` and `~/.agents/`. So `install.sh` registers the repo into the project's `opencode.json` instead — config-driven, not scan-driven.

### 3.3 The invocation axis

The one structural axis in the whole skill set (`CONVENTIONS.md:5-11`):

- **Model-invoked** (default, 14 skills) — no `disable-model-invocation`. The `description` is model-facing with rich trigger phrasing so auto-invocation fires.
- **User-invoked** (23 skills) — `disable-model-invocation: true`. The `description` is human-facing, read by a person scanning the slash-command menu.

**The dependency invariant** (`CONVENTIONS.md:13-19`): a user-invoked skill may call a model-invoked skill; **nothing may call a user-invoked skill**, including another user-invoked skill. Preconditions that are user-invoked skills are written as human instructions ("tell the user to run `/skilled-setup`"), never as calls.

### 3.4 The workflow it encodes

`/skilled` is the router. The main flow, left to right:

```
idea → /domain-interview → [/design-doc] → /write-spec → /write-tickets → /implement (per ticket)
                                    (optional, big work)                        or /implement-spec (whole graph, one PR)
```

`/implement` drives `tdd` at agreed seams and closes with `review-diff`. Model-invoked design skills (`code-craft`, `module-design`, `observability`) fire on their own while code is written. On-ramps feed in from the side: `/triage` for piled-up issues, `diagnose-bug` for breakage, `/decision-map` for foggy effort.

Project state written by `/skilled-setup` and read by everything downstream: `CONTEXT.md` (domain language), `ARCHITECTURE.md` (runtime shape + **Constraints** + **Non-goals**), `docs/adr/`, plus tracker config under `docs/agents/`.

### 3.5 Altitude separation

The design skills are split so no rule lives twice (`CONVENTIONS.md:57-67`):

| Altitude | Owner |
| :--- | :--- |
| How much to build, cross-cutting laws, naming/shape, general data+system design | `code-craft` (itself split across 7 `reference/` files) |
| Module interfaces, seams, SOLID | `module-design` |
| Instrumentation | `observability` |

The validator actually **enforces** this: `check_single_source_of_truth()` warns if `SOLID` is explained at length outside `module-design`, or `rule of three` / `Law of Demeter` / `command-query separation` outside `code-craft`.

## 4. The 37 skills

**23 user-invoked** — `architecture-review`, `clarify-requirements`, `decision-map`, `design-doc`, `design-workflows`, `domain-interview`, `enforce-module-boundaries`, `explain-again`, `git-guardrails`, `handoff`, `handoff-to-agent`, `implement`, `implement-spec`, `retro`, `setup-pre-commit`, `skilled`, `skilled-setup`, `skilled-update`, `teach`, `triage`, `write-questionnaire`, `write-spec`, `write-tickets`

**14 model-invoked** — `code-craft`, `diagnose-bug`, `domain-modeling`, `generate-runbook`, `module-design`, `observability`, `prototype`, `requirements-interview`, `research`, `resolve-merge-conflicts`, `review-diff`, `tdd`, `verify-in-browser`, `writing-for-agents`

**Supporting files:** 16 multi-file skills, 21 single-file. Largest are `code-craft` (7 reference files), `skilled-setup` (8 seed templates), `teach` (4 format docs), `triage` (207-line agent-brief guide). Four skills ship executable artifacts: `git-guardrails/scripts/block-dangerous-git.sh`, `diagnose-bug/scripts/hitl-loop.template.sh`, `enforce-module-boundaries/dependency-cruiser.config.cjs`, `generate-runbook/template.sh`.

**Provenance** (`skills/skilled-update/upstream-map.md`): 30 of the 37 are ports from `mattpocock/skills` at a single commit `3cca18b368ae95cdbdebbff572ccafa662551015`. The 7 originals — no upstream row, "either wholly original or rewritten heavily enough that a diff would be noise" — are `code-craft`, `observability`, `implement`, `skilled-setup`, `skilled-update`, `design-doc`, `verify-in-browser`. The map lives outside skill frontmatter so no other skill's context pays for it.

**Frontmatter discipline:** only `name`, `description`, and `disable-model-invocation` are used across all 37, plus `argument-hint` on exactly four (`design-workflows`, `handoff`, `handoff-to-agent`, `teach`). No skill uses `license`, `compatibility`, `metadata`, `allowed-tools`, or `when_to_use`.

## 5. The installer

786 lines, `set -euo pipefail`, bash 3.2-compatible (no `realpath`, no `readlink -f`, no GNU `stat` — so macOS `/bin/bash` works).

| Flag | Effect |
| :--- | :--- |
| *(none)* | Install all three harnesses, symlink mode |
| `--claude` / `--opencode` / `--antigravity` | Restrict to selected harnesses |
| `--vendor` | Copy real files instead of symlinking |
| `--uninstall` | Remove; scopes to the selected harnesses |
| `--opencode-delegation` | Install the optional add-on (independent of harness flags) |

**Notable mechanics:**
- `--vendor --opencode` alone silently also vendors `.claude/skills`, because OpenCode needs a real directory to point at.
- In vendor mode with both `--claude` and `--antigravity`, `.agents/skills/<name>` becomes a **relative symlink** `../../.claude/skills/<name>` rather than a second copy — halving the vendored footprint.
- All JSON editing goes through a **Python 3 heredoc** (`json.load`/`json.dump`), never string manipulation. If `python3` is missing it warns and skips rather than corrupting.
- A root `opencode.jsonc` is **refused**, not rewritten — "comments don't survive a JSON round-trip" — and the exact hand-edit line is printed instead.
- **Nothing touches `$HOME`.** There is no `~` or `$HOME` in any executable line; every write target derives from the canonicalized `$PROJECT_PATH`. The safeguard is structural, not a path check.
- Uninstall is conservative: `unlink_all` removes a link only if `readlink` exactly matches this repo; `remove_vendored` verifies `name:` frontmatter before deleting; JSON removal is limited to the three values the script has ever written (`KNOWN_PATHS`).

## 6. The opencode-delegation add-on

An optional, Claude-Code-only add-on: 7 slash commands that delegate the heavy lifting to an [opencode](https://opencode.ai) worker team so Claude Code spends fewer of its own tokens.

**Commands:** `/oc` (full pipeline router), plus one per stage — `/ocresearch`, `/ocplan`, `/ocimpl`, `/ocverify`, `/ocbug`, `/ocreview`.

**Worker team** — verified against the agent frontmatter:

| Agent | `mode` | `model` |
| :--- | :--- | :--- |
| `orchestrator` | primary | `agentrouter/gpt-6-astra` |
| `researcher` | subagent | `agentrouter/deepseek-v4-flash` |
| `bug-catcher` | subagent | `agentrouter/deepseek-v4-flash` |
| `implementer` | subagent | `agentrouter/glm-5.3` |
| `verifier` | subagent | `agentrouter/glm-5.3` |
| `bug-reviewer` | subagent | `agentrouter/glm-5.3` |

The orchestrator fallback chain — `gpt-6-astra` → `gpt-5.6-sol` → `claude-opus-5` → `glm-5.3` → `deepseek-v4-flash` — is documented in the orchestrator's **body**, not enforced by frontmatter (opencode agent frontmatter carries a single `model:`).

**The subagent constraint:** `opencode run --agent <name>` only accepts primary agents; naming a subagent silently falls back to the default agent and wastes the run. So every command routes through `orchestrator`, which holds the Task-tool allow-list for the five workers.

**The gate:** every command's first instruction reads `.claude/settings.json` and stops unless `skilledOpencodeDelegation` is exactly `true`. The installer writes that key **only if absent, and only ever as `false`** — confirmed, there is no code path that writes `true`. Enabling is a deliberate human edit.

**The CLAUDE.md merge** is marker-based and idempotent. The fragment file's own first and last lines *are* the `<!-- skilled:opencode-delegation:start/end -->` markers, which makes "insert the fragment" and "insert the marked block" the same operation. No `CLAUDE.md` → it becomes the file; markers present → the block is replaced; file exists without markers → appended.

## 7. Testing

`tests/validate_skills.py` (299 lines, **stdlib only**) is the automated half. It checks: frontmatter presence/parseability, `name` matching the directory, `description` presence, the 1536-char description cap (warning), unknown frontmatter fields, cross-reference validity, no `../other-skill/FILE.md` links, single-source-of-truth between `code-craft`/`module-design`, reserved/colliding skill names (`synced`, `code-review`), and — with `--project` — the actual install state including **vendored-copy drift detection**.

`tests/run.sh` is a 5-line strict-mode wrapper that `cd`s to the repo root and forwards args.

`tests/MANUAL-CHECKS.md` documents what disk inspection cannot cover: **whether a skill actually fires**. A prompt→expected-skill table run per harness, plus harness install sanity and the `/skilled-setup` end-to-end behavior.

**Gaps:** warnings never fail the build; frontmatter is parsed shallowly (no YAML semantics); `install.sh` itself is untested except through its on-disk output; the entire `opencode-delegation/` add-on has **zero automated coverage** (deliberate — the design plan argues these aren't `SKILL.md` files, so `validate_skills.py` correctly ignores them); and the cross-reference check carries an ignore allowlist (`settings`, `users`, `skill`, `name`, `clear`, `compact`, `review`) that could mask a genuinely broken ref.

## 8. Findings

### 8.1 Verified clean

- **The dependency invariant holds.** I grepped every user-invoked skill name against every `Skill tool with "..."` call site: no skill calls a user-invoked skill. All 11 unique call targets are model-invoked.
- **README harness claims are accurate.** All three destination paths check out against the code.
- **The "installer only ever writes `false`" claim is accurate.**
- `install.sh` passes `bash -n` and is macOS-bash-3.2 compatible.

### 8.2 Issues found

**Convention violation (minor, unenforced).** `skills/domain-interview/SKILL.md:9` reaches into another user-invoked skill by raw path — *"route through `skilled`'s main flow, applying the decision tree in `skills/skilled/SKILL.md` step 3"* — introduced by the most recent commit `45e6a1c`. This contradicts `CONVENTIONS.md:27` ("reach it by calling the Skill tool, never by `../other-skill/FILE.md`") but is not a markdown link, so `check_no_relative_skill_links()` doesn't catch it.

**Enforcement gap.** `validate_skills.py`'s `check_cross_references()` verifies that call targets *exist* but never consults the user-invoked set. The dependency invariant — the repo's central structural rule — is enforced by authoring convention only.

**`install.sh` risks:**

| Severity | Issue |
| :--- | :--- |
| High | **Uncaught JSON parse errors abort mid-install.** No `json.loads` is wrapped in try/except. A hand-edited config with a trailing comma raises, `set -e` kills the script — and since Claude/Antigravity linking runs *before* the OpenCode JSON edit, you're left with skills linked but no OpenCode registration, plus a traceback. `validate_skills.py` handles the same input gracefully. |
| High | **`merge_claude_md` / `strip_claude_md_block` can delete content.** Both check only for the START marker. If the END marker is missing, the `awk` drops everything after START — silently truncating the user's `CLAUDE.md`. No guard for an unbalanced marker pair. |
| Medium | **`mv` over a symlinked `CLAUDE.md` replaces the symlink with a regular file** (e.g. `CLAUDE.md` → `AGENTS.md`). No `.tmp` cleanup trap either. |
| Medium | **`link_all` has no collision guard, unlike `copy_all`.** `ln -sfn` doesn't check for an existing real directory of the same name; `copy_all` deliberately skips that case. The two modes are asymmetric in safety. |
| Low | **`copy_all`'s `[ -e "$dest" ]` misses dangling symlinks** (false for a broken link), so those get silently replaced rather than skipped. |
| Low | **OpenCode uninstall can miss what install wrote.** `remove_opencode_config_entry` checks `opencode.json` and `.opencode/opencode.json`; if install edited the nested one and a root file appears later, the stale entry is orphaned. |
| Low | **Stale-symlink detection needs an exact `readlink` match**, so moving/renaming the repo leaves dangling links on uninstall. |
| Low | **Unquoted globs** in `detect_nested_roots` and in the re-install command it prints — breaks on paths with spaces. |

**Stale artifact.** `.opencode/reports/full-exploration.md` (the prior version of this report, 311 lines) declared `.opencode/plans/` and `.opencode/reports/` empty and `.claude/` to contain only `settings.local.json`. All three are now false. It has been superseded by this file.

## 9. Repository state

**The working tree is dirty and the opencode-delegation feature is not committed.**

```
 M README.md
 M install.sh
?? .claude/
?? .opencode/
?? CLAUDE.md
?? opencode-delegation/
```

Everything in the [add-on section](#6-the-opencode-delegation-add-on) exists only as untracked working-tree files. `.ai/plans/opencode-delegation-feature.md` (moved from `.opencode/plans/` since this report was written) is the pre-implementation design plan, and it matches the realized code exactly — layout, markers, flag, default-off semantics.

`.claude/settings.json` in this repo is `{"skilledOpencodeDelegation": true}` — the add-on is enabled on itself. `.claude/settings.local.json` carries a large accumulated Bash permission allowlist (untracked; likely intended to be machine-local).

## 10. Quick reference

```bash
# install into a project (all three harnesses, symlink mode)
./install.sh /path/to/project

# one harness only
./install.sh /path/to/project --claude

# self-contained copies for a shared repo
./install.sh /path/to/project --vendor

# the optional Claude Code delegation add-on
./install.sh /path/to/project --opencode-delegation   # then set the settings key true

# remove
./install.sh /path/to/project --uninstall

# validate this repo, or a project's install of it
python3 tests/validate_skills.py
python3 tests/validate_skills.py --project /path/to/project
```
