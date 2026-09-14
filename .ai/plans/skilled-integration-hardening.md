# Skilled skills and /oc integration: audit and proposed updates

## Objective and context
Bring this repository's installation lifecycle, update workflow, validation, and harness guidance into line with current behavior without replacing its architecture or deliberate skill adaptations. User authorized an audit and proposal, not implementation. Audit date: 2026-09-12. Existing tracked modifications and untracked integration files must be preserved. Risk/effort: large, because installer mistakes can delete project-owned data.

## Current state and evidence

### Upstream currency
- There are 37 skills: 30 tracked ports and 7 original/heavily rewritten skills (`skills/skilled-update/upstream-map.md:7-38`). Every tracked row records `3cca18b368ae95cdbdebbff572ccafa662551015`.
- Independently fetched `https://api.github.com/repos/mattpocock/skills/commits/main`: current upstream HEAD is that same commit (2026-09-04). Thus no commits after the recorded baseline need merging for the 30 tracked ports. This does not certify every local adaptation or untracked derivative, nor establish whole-tree fidelity to upstream; only two port bodies were spot-checked.
- `/skilled-update` watches only mapped SKILL.md files, clones into one fixed temporary path, and bases its clean-state instruction on empty git output (`skills/skilled-update/SKILL.md:19-42,64-66`). A shallow clone works today when HEAD equals the baseline, but after HEAD advances a missing baseline can make git fail with empty stdout. Nonzero exit must mean unknown, never current.

### Confirmed lifecycle defects
All following runtime reproductions used isolated source copies and temporary projects, never this repo or home installs:

| Finding | Evidence | Observed result |
|---|---|---|
| Add-on installation overwrites unowned same-named files | `install.sh:475-494` | Both symlink and vendor installs destroyed sentinel command/agent contents; exit 0 |
| Add-on uninstall deletes by filename rather than ownership | `install.sh:500-510` | Never-installed user command/agent files deleted; exit 0 |
| Vendor skill ownership inferred from ordinary frontmatter | `install.sh:215-220,238-239,284-285` | A user's `tdd` skill with `name: tdd` and extra notes was overwritten on install and deleted on uninstall; exit 0 |
| Unbalanced CLAUDE block loses user content | `install.sh:529-540,555-561` | Missing end marker removed trailing user text on install/uninstall; exit 0. Orphan end marker was duplicated on install |
| Add-on symlink to vendor conversion fails | `install.sh:491` | macOS cp reported identical source/destination; exit 1 |
| Skill mode conversion produces incorrect state | `install.sh:177,215,261` | Vendor to symlink left real directories with nested self-named links; symlink to vendor skipped all 37 entries |
| Invalid settings discovered after changes | `install.sh:578-593,739-760` | Invalid settings JSON caused exit 1 after 13 links and CLAUDE.md had already been created |

Additional source-confirmed gaps: uninstall dispatch depends on requested vendor flag rather than actual installed form (`install.sh:719-735`); JSON writers lack a common parse/type preflight; the fixed `CLAUDE.md.tmp` path can collide with a user file. Full runtime coverage of every flag combination is not yet complete.

### Compatibility and validation
- OpenCode v1.18.30 discovers project `.claude/skills`, `.agents/skills`, and `.opencode/{skill,skills}`. Tagged evidence: `https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/skill/index.ts` (`discoverSkills`, lines 173-227). This contradicts `README.md:33,107,111`, `CONVENTIONS.md:41`, `install.sh:50-58`, `tests/MANUAL-CHECKS.md:36-39`, and `tests/validate_skills.py:278-294`.
- Explicit `skills.paths` remains valid and useful, especially for `--opencode`-only symlink installations and disabled external discovery. Do not remove registrations wholesale.
- Tagged `packages/opencode/src/cli/cmd/run.ts` confirms a subagent selected through `--agent` emits a warning and falls back, rather than silently falling back. Headless permission requests are rejected unless auto-approval is enabled; safe guidance should report the blocker, not add blanket `--auto`.
- Fallback chains in `opencode-delegation/agents/orchestrator.md:32-34` and `CLAUDE.fragment.md:37-41` are policy, not enforcement supplied by these files. Runtime fallback requires separate configuration/plugin support, which this repo does not install.
- Vendored validation compares only SKILL.md (`tests/validate_skills.py:233-240`); supporting-file drift is invisible. Invocation checks only match double-quoted calls (`:123,135`), missing the existing backtick call in `skills/retro/SKILL.md:11`. Nested-file self references use the immediate parent instead of the containing skill (`:175`).
- Existing tests do not exercise `/oc` install/uninstall, marker safety, collisions, or mode transitions.

### Findings rejected or limited
- Claude Code `allowed-tools` is preapproval, not a strict tool denylist. Do not broaden permissions to fix a nonexistent restriction.
- OpenCode permission matching is last-match-wins; wildcard-first agent rules are correct and must remain that way.
- Current published Claude settings schema permits additional top-level properties; no evidence justifies migrating `skilledOpencodeDelegation` merely because it is custom.
- No demonstrated executable argument injection was established; these command bodies are model instructions, not direct shell interpolation code.
- The provider `reasoning_content` failure recurred once during this audit; retry succeeded. CLI currency does not fix it. Global provider repair remains separately scoped in `reasoning-content-fix.md`.

## Proposed change list

### Phase 1: installation safety and regression coverage (priority)
1. **`install.sh`**: retain the public entry point, existing target locations, harness flags, and separate opt-in add-on. Add preflight of selected config targets (JSON syntax and expected object/list types), exact balanced marker blocks, target types, and ownership conflicts before mutations. Fail with actionable diagnostics rather than traceback/false success.
2. **`install.sh`**: replace name-based ownership with a small versioned project-local manifest, proposed `.skilled-install.json`, containing installer-owned relative paths, installed kind, source identity, and content fingerprints/link targets. Record only registrations/toggle values created by the installer. Do not store secrets, full config contents, or timestamps unless needed. Validate manifest shape and path containment; a manifest is not a license to delete changed files.
3. **`install.sh`**: recognize exact installer symlinks for backward compatibility. Preserve unmarked legacy copies, foreign links/directories, changed managed content, and ambiguous state; report a conflict with manual backup/migration guidance instead of adopting them by name. Never overwrite via a destination symlink or symlinked ancestor outside the project. Managed vendor updates/uninstall must compare the last installed fingerprint and refuse destructive action when users changed content.
4. **`install.sh`**: safely convert recognized owned entries between symlink and vendor forms, and uninstall by actual entry kind regardless of the supplied vendor flag. Never run ln against an existing real directory or cp through a destination link. Update only owned path registrations during mode changes; preserve preexisting matching and unrelated values. Keep bare uninstall's add-on separation, but document it clearly.
5. **`install.sh`**: refuse missing/reversed/duplicate/ambiguous markers before writing. Preserve unrelated CLAUDE text and toggle values. Use unique same-directory temporary files and atomic replacement for JSON/manifest/CLAUDE writes; clean only this run's temporary files. Preflight prevents known invalid-input partial updates; do not promise a fully transactional multi-file rollback for disk failures.
6. **New `tests/test_install.py`**, wired into **`tests/run.sh`**: standard-library temporary fixtures with minimal copied source, never the user's project/home. Test collisions (files/directories/dangling and outside links), changed managed content, legacy unknown copies, manifest validation/path traversal, malformed JSON/types, marker states, install/reinstall/uninstall, mode transitions, selected harnesses, add-on-only behavior, preserved toggles/registrations, and source integrity. No live model calls in CI.

### Phase 2: validator, updater, and accurate guidance
7. **`tests/validate_skills.py`** and **new `tests/test_validate_skills.py`**: validate managed whole skill trees (names, file contents, executable bits where relevant, and link kinds), ignoring only declared installer metadata. Diagnose missing/changed supporting files and malformed shapes without crashes. Recognize installed targets from manifest or explicit scope, not assume all harnesses were installed. Accept documented OpenCode native discovery without requiring redundant config, while still validating explicit registrations. Match quoted/backtick Skill tool calls and resolve nested self-reference ownership correctly; keep generic prose out of overly broad regex rules.
8. **`skills/skilled-update/SKILL.md`**, **`skills/skilled-update/upstream-map.md`**, **`CONVENTIONS.md`**: use a unique owned temporary directory, verify clone/git exit status and baseline availability, and report unknown on missing history/network errors. Watch each mapped skill directory for supporting-file additions/removals as well as SKILL.md; preserve entrypoint provenance paths and add/document the directory watch scope. Keep report-before-apply and all 30 baseline SHAs unchanged since no upstream update is needed.
9. **`README.md`**, **`CONVENTIONS.md`**, installer comments, **`tests/README.md`**, **`tests/MANUAL-CHECKS.md`**: correct skill-discovery claims with tagged evidence, describe explicit registration as an additional mechanism, document ownership/collision/legacy migration behavior and uninstall scope. Fix the minor 'table below' reference. Keep Antigravity behavior unchanged where current public documentation was not verified.
10. **`opencode-delegation/CLAUDE.fragment.md`**, **`opencode-delegation/agents/orchestrator.md`**, relevant **`opencode-delegation/commands/*.md`**, **`README.md`**: distinguish configured primary models and desired fallback policy from runtime enforcement; retain the desired model chain but make its external prerequisite explicit. Correct 'silently' to 'with a warning' where present. Document headless permission rejection, literal/safely quoted task text, and bounded failure reporting; never recommend broad permission bypass. Preserve current task routing and worker model assignments.

## Blast radius and constraints
- Phase 1 changes install/update/uninstall behavior for new projects and recognized managed installations. Collision refusal is intentional and safer, but existing unmarked vendored installs will need explicit migration rather than silent replacement.
- A small manifest is new on-disk metadata. It must survive vendor sharing using relative target paths and must not erase ownership records for components omitted from a later partial install.
- Source command/agent changes affect this repo's symlinked local add-on immediately, but regular global copies do not auto-sync. No global sync, reinstall into this repo, CLI changes, personal CLAUDE replacement, provider changes, or commits are included in this proposal.
- Preserve all existing architecture, file organization, skill split, deliberate content adaptations, model policy, and existing user edits. No application/UI redesign is relevant.

## Options considered
1. **Documentation-only refresh:** small and low disruption; leaves reproduced data-loss paths intact. Not recommended.
2. **Scattered guards/content equality only:** smaller patch and useful emergency mitigation, but cannot distinguish older managed copies, local modifications, obsolete paths, or mode changes reliably. Insufficient for maintainable updates.
3. **Ownership manifest plus focused preflight and lifecycle tests (recommended):** larger but bounded installer hardening, with conservative migration and verifiable behavior. Keep shell entry point and standard-library dependencies; avoid a general installer framework or global package manager.

## Risks and mitigations
- **Loss of custom project files:** fail closed on ambiguity; track last-installed state; include destructive regression fixtures before considering changes complete.
- **Legacy installs:** preserve unknown copies, explain conflict, never auto-adopt based on frontmatter or filename. Exact symlink recognition must not follow arbitrary outside ancestors.
- **Schema drift:** validate proposed OpenCode field shapes against `https://opencode.ai/config.json` before any config-format edits; no new runtime config keys proposed here.
- **Partial writes and concurrent changes:** preflight plus unique atomic writes and recheck ownership before replacement; explicitly document that multi-file transaction rollback is out of scope.
- **False validator confidence:** separate content checks, isolated lifecycle tests, and optional manual live delegation. Passing the first is not evidence for the others.
- **Review scope:** implement phases as separate briefs, full bug-catcher plus bug-reviewer and verifier after each; at most two fix iterations before reporting remaining problems.

## Verification plan
Baseline independently rerun: `bash -n install.sh`, `./tests/run.sh`, and `git diff --check` all PASS (37 skills, zero errors, four existing advisory frontmatter warnings). Isolated reproductions above FAIL as documented; they were not added to the repository yet. Verifier integrity comparison found zero changes across its 3764-entry baseline, and its temporary artifacts were removed.

After approved implementation:
1. Re-run shell syntax, unified tests including new unit/lifecycle tests, and diff whitespace checks. This repository has no application typecheck/build to substitute for lifecycle tests.
2. Independently confirm every reproduced defect now preserves sentinel data or refuses before mutation; verify successful fresh install/reinstall/update/uninstall in both modes.
3. Validate full vendor trees, partial harness installs, config-disabled discovery caveats, migration conflicts, and repeat invocations. Test on macOS and Linux where available; report any unavailable platform.
4. Review exact diff against the per-file list and preserve unrelated dirty work. No live model calls or global mutations needed for automated tests.
5. Optional separately approved manual smoke: load commands/agents in fresh harness sessions and check on/off gate, delegation, safe headless failures, and tool-call-followed-by-response behavior. Never label provider reasoning repair complete based on static tests.

## Status
Audit and proposal only. This plan is the only new repository file created by this audit. No implementation, global synchronization, or skill installation performed. Awaiting user approval for phases 1 and 2.
