# Audit remediation + orchestrator reasoning/tools fix

## Objective and context
Two inputs converged this session: (1) an external readiness audit of `skilled`
(installer data loss, review-diff scope bug, git-guardrail bypass, and CI-gate
gaps), and (2) a request to fix the opencode `orchestrator` agent's
`reasoning + tools` incompatibility on AgentRouter, make orchestration fast and
low-token, and fix that backgrounded `opencode run` calls are invisible until
they finish. This plan reconciles the audit against two already-existing,
unimplemented proposals in this repo (`skilled-integration-hardening.md`,
`reasoning-content-fix.md`) instead of duplicating them, and adds what neither
covers.

## Part A — Orchestrator reasoning+tools fix (decision, not just options)

### Current live state (verified 2026-09-14)
`~/.config/opencode/opencode.json` already sets, for `agentrouter/gpt-6-astra`:
```json
"gpt-6-astra": { "name": "gpt-6-astra", "reasoning": false, "options": { "reasoningEffort": "none" } }
```
This is a **third**, already-applied fix distinct from both `reasoning-content-fix.md`
(interleaved `reasoning_content` replay, proposal-only, unverified) and the
pasted analysis's Option 1/Option 2 (switch model / add an Architect agent).
Disabling reasoning on gpt-6-astra avoids sending `reasoning` and `tools`
together in the same request, which is what crashes on AgentRouter — so the
orchestrator currently runs without visible chain-of-thought but with full
tool/task-calling ability intact.

### Decision: keep reasoning off for the orchestrator specifically
Reject both alternatives the other analysis offered, for reasons tied directly
to this session's stated goals (fast, low token, no context bloat):
- **Reject Option 2 (dedicated Architect/Planner agent with no tools).** It adds
  a full extra model round-trip — and its full output must re-enter the
  orchestrator's context — before any delegation can start. That is more
  latency and more tokens per task, not less. The orchestrator's job is
  dispatch, not deep reasoning; it doesn't need a thinking pass to decide
  "call researcher then implementer."
- **Reject Option 1 (switch orchestrator model to glm-5.3/claude-opus-5 to keep
  reasoning).** Visible chain-of-thought from the dispatcher is not load-bearing
  — the actual thinking work already happens inside `researcher`/`implementer`/
  `bug-reviewer`, which keep their own models and reasoning untouched. Paying
  reasoning-token cost on every orchestrator turn just to narrate "I will now
  call the researcher" is the token-hunger this session explicitly wants gone.
  It would also change which model plans delegation, an untested regression
  risk for no measured benefit.
- **Do not pursue `reasoning-content-fix.md`'s interleaved-replay approach for
  the orchestrator.** That plan targets *worker* models (deepseek/glm) hitting
  the same family of error via multi-turn replay, which is a different failure
  path than gpt-6-astra's single-request tools+reasoning rejection. Leave that
  plan scoped to workers only, and mark it superseded for the orchestrator's
  specific case by the `reasoning:false` fix already live.

### What's left to do here
1. Document the fix in `opencode-delegation/agents/orchestrator.md` and
   `CLAUDE.fragment.md` (both repo copies of the policy text currently describe
   only the fallback chain, not this constraint) so the reasoning-off
   requirement isn't silently reverted by a future edit. One sentence: gpt-6-astra
   must keep `reasoning:false` on AgentRouter; do not re-enable without
   confirming AgentRouter accepts `tools+reasoning` together first.
2. No opencode.json change needed — already correct and confirmed live.

## Part B — Visibility: "it runs in background and I can't see it at all"
Root cause: `opencode run ... &` / `run_in_background: true` gives only a
start + a completion notification; nothing streams in between, so a 5-10
minute orchestrator run looks hung.
**Fix:** after every backgrounded `opencode run --agent orchestrator` launch,
immediately attach the `Monitor` tool to that background task. Monitor
streams each stdout line as a notification as it's produced, which surfaces
the orchestrator's own `todowrite` progress and subagent hand-off lines live
instead of only at the end. This requires no opencode-side change — it's a
Claude Code-side habit change, so fix it in the `oc`/`ocimpl`/`ocplan`
skill instructions (`opencode-delegation/commands/*.md`) by adding: "attach
Monitor to the background task immediately after launch; do not wait silently
for the completion notification."

## Part C — Audit findings NOT already covered by `skilled-integration-hardening.md`
That plan (Phase 1/2, proposal-only, awaiting approval) already fully covers:
installer overwrite/uninstall-by-filename/marker-balance/mode-conversion data
loss, validator supporting-file blindness and invocation-quoting gaps, and
stale OpenCode-discovery docs. Verified still accurate by spot-check this
session (install.sh overwrite/uninstall-by-name logic unchanged since that
plan was written). Do not re-litigate it — implement it as written once approved.

New findings from this session's audit, confirmed by direct source read, that
the hardening plan does **not** mention:

1. **review-diff pre-commit scope bug (High).** `skills/implement/SKILL.md:33`
   calls `review-diff` "against the point you started from" *before
   committing*. `skills/review-diff/SKILL.md:21` hard-codes
   `git diff <fixed-point>...HEAD`, a committed-tree three-dot diff — it never
   sees staged/unstaged/untracked work. On the common single-ticket path
   (implement → review → commit), this reviews nothing or stale history.
   **Fix:** in `review-diff/SKILL.md` step 1, when `<fixed-point>` resolves to
   an ancestor of a dirty working tree, union the three-dot diff with
   `git diff HEAD` (unstaged), `git diff --cached` (staged), and untracked
   files under the repo (`git ls-files --others --exclude-standard`, filtered
   to relevant paths) into the reviewed set. State explicitly which of
   committed/staged/unstaged/untracked was included in the report header.

2. **git-guardrails pattern bypass and false positives (Medium-High).**
   `skills/git-guardrails/scripts/block-dangerous-git.sh:6-23` is unanchored
   substring `grep -E` over the raw command string. Confirmed bypasses:
   `git -C . push origin main` (no literal substring "git push"), `git clean -df`
   (pattern list only has `-fd` and `-f`, not `-df`/combined-short-flag order).
   Confirmed false positive: any command string that merely *contains* the
   text "git push" (e.g. an echo or commit message) is blocked. Malformed JSON
   input silently falls through to allow (jq error → empty `$COMMAND` → no
   pattern matches → exit 0).
   **Fix:** parse the command with `jq`'s actual tokenization intent in mind —
   at minimum: (a) fail closed (block) on jq parse error instead of falling
   through to allow; (b) match on normalized argv tokens, not raw substring —
   split on whitespace/`&&`/`;`/`|` and check the first two tokens are
   literally `git`+subcommand, ignoring `-C <dir>`/`--git-dir=` prefixes; (c)
   expand the flag-combination set for `clean` (`-f`, `-d`, `-fd`, `-df`, `-x`,
   any order) and `checkout .`/`restore .` variants (`-- .`, `-p .` is safe,
   bare `.` is not). Add a small bats/shell test fixture enumerating the
   confirmed bypasses and false positive as regression cases — currently
   ShellCheck isn't even run (per audit); add it to the same test pass.

3. **No final-merged-state verification gate in `implement-spec` (Medium).**
   `skills/implement-spec/SKILL.md:25-33` merges parallel slice work and
   applies review fixes without an explicit "test/typecheck the merged
   result" step before marking ready. **Fix:** add a mandatory step after the
   merge + fix loop: run the full test suite and typecheck against the
   final merged branch state (not per-slice), and re-run it again after any
   post-review fix commit, before the skill may report done.

4. **`enforce-module-boundaries` scan scope gap (Medium).**
   `skills/enforce-module-boundaries/SKILL.md:61,79-87` — the demonstrated
   `depcruise <packages-root>` invocation can exclude application code whose
   imports are exactly what the boundary rule should police, and the worked
   example only covers one violation class. **Fix:** change the documented
   invocation to scan the full relevant dependency graph root (not a
   sub-root that can omit app code), and add a second worked example/negative
   test for a different violation class (e.g. reverse-direction import, not
   just layer-skipping).

5. **Unpinned verification tool install (Low-Medium, supply-chain).**
   `skills/verify-in-browser/SKILL.md:24` requests an unpinned global install.
   **Fix:** pin an exact version (and note how to bump it deliberately),
   consistent with the audit's broader "pin verification tools" recommendation.

6. **Validator description-length threshold mismatch (Low).**
   `tests/validate_skills.py` warns at 1536 chars; the portable Agent Skills
   spec limit (agentskills.io/specification) is 1024. No skill currently
   exceeds either, so this is latent, not an active break. **Fix:** lower the
   warning threshold to 1024 to match spec, keep it a warning (not an error)
   unless the project wants stricter enforcement.

7. **CLI arg validation gap (Low).** Audit notes bare `--project` is silently
   ignored by `install.sh` rather than rejected. Fold this into the Phase 1
   preflight work already scoped in `skilled-integration-hardening.md` item 1
   (reject malformed/unknown arguments) rather than treating it separately.

## Blast radius
- Part A/B: no application code changes; agent/skill instruction docs only.
  Zero risk to install/uninstall behavior.
- Part C.1-C.2: change review and guardrail *behavior* for every future
  ticket — correctly stricter, not a regression, but should get its own
  regression tests before being treated as done (mirrors the audit's own
  "gates that fail open are not gates" point).
- Part C.3-C.6: scoped to their individual skill files; no cross-skill coupling.
- Does not touch `skilled-integration-hardening.md`'s Phase 1/2 scope at all;
  that plan still needs separate user approval to implement (installer
  mutation code, highest blast radius in the whole repo).

## Verification plan
- Part A/B: re-read edited `.md` files; no runtime test needed (docs only).
- C.1: construct a dirty working tree with staged+unstaged+untracked changes
  and no new commits; confirm updated review-diff process reviews all of it.
- C.2: re-run the confirmed bypass/false-positive commands from the audit
  against the patched script; all must now block (bypasses) or pass (false
  positive case) correctly. Add these as permanent test fixtures.
- C.3-C.6: read-back diff review; no runtime harness exists for these beyond
  the shell/validator tests already in `tests/run.sh`.

## Status
Plan written, not yet approved for implementation. Awaiting user go-ahead on
scope/order before delegating or making edits.
