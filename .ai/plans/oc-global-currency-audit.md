# OpenCode / Claude Code currency audit and update plan

## Objective and context
Check the active global CLIs and this repository's `/oc` integration, then update only what needs changing after approval. Audit performed 2026-09-12. Existing uncommitted work must remain untouched.

## Current state
- Executed `opencode --version`: 1.18.30; `npm view opencode-ai version`: 1.18.30. Active executable resolves through fnm's Node v24.3.0 installation.
- Executed `claude --version`: 2.1.222; `npm view @anthropic-ai/claude-code version`: 2.1.269. Active executable is `/Users/phumrin/.local/bin/claude`; a separate fnm npm copy also reports package version 2.1.222.
- `which -a` also finds `/usr/local/bin` copies of both tools and `/opt/homebrew/bin/opencode`. Research found older package versions there; these are not the active executables.
- All seven source command files and six source agent files match their global counterparts byte-for-byte. Project-local copies also match. These are custom integrations, not separately versioned upstream CLI packages.
- `README.md:58-73` documents project-local skill installation and symlink/vendor refresh. `README.md:83-93` distinguishes the `/oc` add-on from Agent Skills. `install.sh:475-494` installs add-on files locally, not globally.
- The 37 repository skills have no matching installations under the two inspected global skill directories. The repository itself also lacks a project skill install; validation reports four missing-target warnings.
- `.claude/settings.json:2` enables delegation here. Source/global CLAUDE policies differ intentionally; do not replace the user's global policy wholesale.
- Existing tests validate skills, not the full `/oc` delegation lifecycle. Initial researcher calls failed with a provider `reasoning_content` error; retries succeeded. `.ai/plans/reasoning-content-fix.md:14-35` (moved from `.opencode/plans/` since this audit was written) contains a separate proposed fix, still requiring validation and approval.

## Proposed changes
1. Run `/Users/phumrin/.local/bin/claude update`; verify the active version against fresh registry metadata. Let the supported updater manage native installation files. Investigate channel/rollout constraints if it does not reach the published latest release; do not silently switch installation methods.
2. Leave the active OpenCode installation unchanged because it is current.
3. Leave matching `/oc` commands and agents unchanged; no synchronization is necessary.
4. Optional, separate approval: install this repository's skills here for both requested harnesses with `./install.sh /Users/phumrin/Documents/skilled --claude --opencode`. Expected targets: `.claude/skills/` and `opencode.json` skills registration; inspect the installer before execution and preserve existing config.
5. Optional, separate approval: remove stale duplicate CLI installations after confirming each package manager's actual prefix and ownership. Keep fnm OpenCode and native Claude. Do not blindly uninstall through an ambiguous npm executable, use sudo, or remove unrelated brew taps/packages.
6. Treat provider reasoning repair and new `/oc` lifecycle tests as follow-up changes with their own reviewed scope, not part of a CLI version update.

## Blast radius
Updating native Claude affects future invocations in every project. Optional duplicate cleanup changes PATH fallback behavior. Optional skill installation affects this project only. No provider credentials, personal global policy, application code, or model fallback changes are included.

## Options considered
1. **Minimal update (recommended):** update active Claude only; preserves working OpenCode and matching integration files. Leaves duplicate installations and provider reliability issue for explicit follow-up.
2. **Update and clean duplicate CLIs:** reduces PATH ambiguity, but may disrupt scripts using absolute paths and needs ownership/prefix checks.
3. **Broader integration work:** install skills, repair reasoning replay, and add lifecycle tests; improves coverage but exceeds a version refresh and requires separate review.

## Risks and mitigations
- Latest registry version may differ from the native updater's configured channel or rollout: compare actual updater output; report any mismatch rather than claiming success.
- Existing sessions may continue using old loaded code/config: restart affected CLIs after updates.
- Existing dirty repository and personal global files: preserve them; no git pull/reset, blanket copying, or commits.
- Matching files and passing skill checks do not prove model/provider reliability: report the observed worker error separately and verify fresh multi-turn calls if a provider fix is approved.

## Verification
- Baseline independently rerun: `bash -n install.sh` PASS; `./tests/run.sh` PASS (37 skills, 0 errors, 4 warnings); `python3 tests/validate_skills.py --project /Users/phumrin/Documents/skilled` PASS (0 errors, 8 warnings).
- After approved update: independently run `which -a opencode claude`, both active version commands, fresh npm version queries, and `claude doctor` if supported/noninteractive.
- After optional skill install: rerun project validator; inspect git diff and installed links/config.
- After any cleanup: verify intended active paths and versions again; report remaining duplicates explicitly.

## Status
User approved the minimal Claude update. `/Users/phumrin/.local/bin/claude update` exited 0 and updated native Claude from 2.1.222 to 2.1.269. The supported updater also corrected its recorded installation method from `global` to `native`; no manual configuration edits were made.

Independent verifier checks and orchestrator version spot-checks confirm active Claude 2.1.269 and OpenCode 1.18.30. Fresh npm queries match both installed versions. `claude doctor` completed and confirmed native installation, bundled search OK, and auto-updates enabled on the latest channel. It warned about the leftover fnm npm Claude installation; its last-update metadata still referenced the previous version despite the current binary reporting 2.1.269.

No duplicate installations were removed, no skills installed, and no provider or agent configuration changed. Existing repository changes were preserved. This plan is the only repository file edited for this audit/update. Restart Claude Code sessions to use the new binary. Provider reasoning reliability and optional duplicate cleanup remain separate follow-ups.
