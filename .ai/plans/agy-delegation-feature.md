# agy (Antigravity CLI) delegation — spec

## Objective & context

`skilled` already has an opencode-delegation add-on: Claude Code, as
orchestrator, delegates research/implementation/verification work to opencode
subagents running `deepseek-v4-flash`. The user wants an analogous lane for
`agy` — Google's Antigravity CLI, already installed and authenticated on this
machine (`/Users/phumrin/.local/bin/agy`, v1.2.4) — specifically for
Gemini Flash's speed on web search / URL fetching / browser-driven testing,
which opencode's roster doesn't cover as natively.

This is a spec only. Nothing below has been implemented yet.

## Current state (verified live, not just read from docs)

**Headless invocation works and mirrors opencode's shape:**
- `agy -p "<prompt>" --output-format json` → single JSON object
  `{conversation_id, status, response, duration_seconds, num_turns, usage}`.
  No `--format json` streaming-events mode like opencode's `--format json`
  (agy's `stream-json` output format exists per `--help` but wasn't tested
  here) — for Monitor-based live progress we'd need to test
  `--output-format stream-json` specifically before relying on it.
- `--model gemini-3.8-flash-high` (and the other `gemini-3.x-flash-*` /
  `gemini-3.1-pro-*` / `claude-sonnet-4-6` / `claude-opus-4-6-thinking` /
  `gpt-oss-120b-*` variants — from `agy models`) selects the model per
  invocation, same as `opencode run --model`.
- Simple no-tool calls: ~2-3s. A call needing `read_url_content` was
  auto-denied (see below) but took ~31s before returning — the model spent
  time retrying/reasoning about the denial rather than failing fast; worth
  accounting for in timeout budgets.

**Default agent's built-in tools** (from asking it directly):
file/dir tools (`run_command`, `view_file`, `write_to_file`,
`replace_file_content`, `list_dir`, `find_by_name`, `grep_search`), web
(`search_web`, `read_url_content`), image gen, its own subagent primitives
(`invoke_subagent`, `define_subagent`, `manage_subagents`, `send_message`),
MCP (`call_mcp_tool` etc. — one MCP server, `pos-system`, is already
configured globally), and `ask_question`/`schedule`. No native
click/screenshot browser-automation tool — that would still go through
`run_command` shelling out to the separate `agent-browser` CLI, same pattern
opencode workers use for anything not in their built-in toolset.

**Headless permission behavior mirrors opencode's fail-closed design:**
tested `agy -p "use search_web ... then read_url_content ..."` without
pre-approval — it did not hang. It returned
`status: "SUCCESS"`, empty `response`, and
`denied_actions: [{"action":"read_url","display_name":"ReadUrlContent"}]`,
plus a stderr line naming the exact permission needed
(`read_url(<target>)`) and how to grant it. This is the same
verify-before-trust pattern the opencode guardrails rely on.

**Permission model is meaningfully different from opencode's — this is the
main design constraint:**
- opencode: permissions are declared **per agent role** in that agent's own
  `.md` frontmatter (`permission.bash`, glob-keyed). `implementer` and
  `researcher` can have completely different, independently-scoped rules.
- agy: permissions live in **one flat global list** —
  `~/.gemini/antigravity-cli/settings.json` → `permissions.allow`, an array
  of `"command(<exact string or pattern>)"` / `"<tool>(<target>)"` entries.
  This file already has ~dozens of accumulated entries from the user's own
  real interactive sessions across multiple unrelated projects. There is no
  discovered project-local settings.json that layers on top of it — only
  workspace-level `.agents/` (rules, skills, hooks, MCP), not a
  workspace-level *permissions* override.
  - Consequence: any `permissions.allow` rule added to make delegation work
    headlessly (e.g. pre-approving `search_web`/`read_url_content`) applies
    to **every** agy session on this machine, including the user's own
    interactive ones — not scoped to "delegated-by-Claude-Code" sessions the
    way opencode's per-agent scoping is.

**Hooks *can* do path-aware gating, which opencode's tool permissions
could not** (this is a genuine capability opencode lacked):
`.agents/hooks.json` supports a `PreToolUse` hook that receives the tool
call's `args` on stdin (e.g. a `view_file` call's file path) and returns
`{"decision": "allow"|"deny"|"ask"|"force_ask", "reason": "..."}` on stdout.
Unlike opencode's boolean-only `read`/`glob`/`grep` tool permissions, this
means a credential-file guard for agy could actually inspect the *path
being read*, not just gate by tool name or bash command substring. This is
untested here (no hook was written or run) but is a real, documented
capability, not a guess.

**Customization discovery** (for where a future implementation would live):
workspace root `.agents/` (or `.agent/`/`_agents/`/`_agent/`), walking up
to the repo root — same shape as opencode's `.opencode/`. Rules go in
`GEMINI.md`/`AGENTS.md` (no frontmatter, always-on) or `.agents/rules/*.md`.
Skills go in `skills/<name>/SKILL.md`. Hooks in `hooks.json`. MCP config in
`mcp_config.json`. Global equivalents live under `~/.gemini/config/`.
`install.sh --antigravity` already installs `skilled`'s base skills into
`.agents/skills/` for projects that opt in — this would be the same
distribution point for an agy-delegation add-on.

## Proposed design

**Scope narrowly, on purpose:** given agy's flat global permission list, do
*not* try to replicate opencode's `implementer`-style broad
edit+bash+destructive-command-guard role for agy right now — there's no
clean way to scope that to "only when Claude Code delegated this" without
also opening it up for the user's own interactive agy usage. Instead:

1. **New role: `web-researcher`** — read-only web research, URL fetching,
   and (optionally) browser-driven testing via `agent-browser` shelled
   through `run_command`. No file edits, no destructive commands. This
   matches the user's own stated use case (fast Gemini Flash for
   explore/web-search/web-testing) and sidesteps the permission-scoping gap
   entirely, since a read-only role has much less to gate in the first
   place.
2. **Delegation call shape**, mirroring `opencode run --agent orchestrator`:
   ```
   agy -p "<self-contained brief>" --model gemini-3.8-flash-high \
       --output-format json --add-dir <project>
   ```
   launched the same way as opencode calls: Bash `run_in_background: true`,
   immediately followed by attaching `Monitor` — *after* first verifying
   `--output-format stream-json` actually gives per-step events the way
   opencode's `--format json` does (untested; `text`/`json` were the only
   formats exercised here).
3. **Pre-approve exactly what the role needs**, nothing broader:
   `search_web`, `read_url_content`, and (if browser-testing is wanted) a
   scoped `command(agent-browser *)` entry — added to
   `~/.gemini/antigravity-cli/settings.json` `permissions.allow`. Document
   in the CLAUDE.md addition that this list is global-shared, so the user
   understands the tradeoff going in (not discovered after the fact).
4. **Credential-file guard via `PreToolUse` hook**, not a permission
   pattern: a `.agents/hooks.json` `PreToolUse` handler matching
   `view_file|grep_search|find_by_name|read_url_content` that inspects the
   path/URL argument against the same credential patterns already used for
   opencode (`.env*`, `*credentials*.json`, `*service-account*.json`,
   `google*.json`, `*.pem`, `id_rsa*`, `id_ed25519*`) and returns
   `{"decision": "deny"}` on a match. This would need to be written and
   live-tested the same way the opencode guards were (a real credential
   file, a real denial, confirmed) before being trusted.
5. **CLAUDE.md addition**, gated the same way as the opencode section
   (`.claude/settings.json` flag — likely a new key,
   e.g. `skilledAgyDelegation`, kept independent of
   `skilledOpencodeDelegation` so a project can opt into one, both, or
   neither): when to reach for `agy`/Gemini Flash vs. opencode — web
   research and browser-testing to `agy`, code research/implementation/
   verification stays with opencode. Same "precise and thorough brief,"
   "evaluate don't relay," Monitor-attached-immediately discipline as the
   existing section.

## Options considered

1. **Narrow read-only `web-researcher` role (recommended above).** Pros:
   sidesteps the flat-global-permission problem, matches the user's actual
   stated use case, smallest new attack surface. Cons: doesn't give Claude
   Code an agy-based alternative to `implementer`/`verifier` — code work
   stays on opencode only.
2. **Full role parity with opencode (researcher + implementer + verifier
   equivalents on agy).** Pros: symmetry, lets the user pick agy vs.
   opencode per task freely. Cons: the permission-scoping gap means an
   "agy implementer" would need broad `command(...)` / `write_to_file`
   approval in the *same global list* the user's interactive sessions use —
   no way to keep it delegation-only without a per-workspace permissions
   override, which wasn't found to exist. Higher risk for the reward; not
   recommended until/unless a workspace-scoped permissions mechanism turns
   up.
3. **Do nothing / stay opencode-only.** Simplest, but leaves the concrete
   speed advantage the user already noticed (Flash's fast web search/fetch)
   unused.

Recommendation: option 1.

## Blast radius

New, additive only — no existing opencode-delegation files change:
- New `.ai/plans/agy-delegation-feature.md` (this file).
- (Future, on approval) new `agy-delegation/` directory in `skilled`,
  mirroring `opencode-delegation/`'s shape: a rules fragment, a
  `hooks.json` template, a `CLAUDE.fragment.md` addendum, wired into
  `install.sh` behind a new opt-in flag (e.g. `--agy-delegation`) and a new
  settings key, following the exact same "off by default, flag required,
  runtime check in the entry point" pattern already proven for
  opencode-delegation.
- (Future) one line added to `~/.gemini/antigravity-cli/settings.json`
  `permissions.allow` per approved tool — global, shared with the user's
  own interactive agy sessions (flagged above, not hidden).

## Risks & mitigations

- **Global permission list is shared with interactive use.** Mitigation:
  keep the pre-approved tool set minimal (`search_web`, `read_url_content`,
  optionally scoped `agent-browser`) and read-only — nothing destructive or
  write-capable gets pre-approved this way.
- **Credential-file exposure via `view_file`/`grep_search`/URL fetch.**
  Mitigation: the `PreToolUse` hook design above — verify it live the same
  way the opencode `.env`/`git show` guards were verified (real file, real
  denial, captured) before trusting it, not just written and assumed
  correct.
- **`stream-json` for live Monitor progress is unverified.** Mitigation:
  test it explicitly before building the Monitor-attached workflow step
  into the CLAUDE.md addition; fall back to plain `--output-format json`
  (single blob, no live steps) if it doesn't behave as expected.
- **Slow failure mode observed** (~31s for a denied-tool call vs. ~2-3s for
  a clean one) — budget timeouts accordingly, don't assume agy fails as
  fast as opencode does on a permission rejection.

## Verification plan (once built)

1. Positive test: a real read-only research brief (e.g. "find current
   version of X via search_web") completes successfully end-to-end with
   pre-approved permissions, no denial.
2. Negative test: a brief that would touch a credential-pattern path (fake
   `.env` in a scratch dir, same style as the opencode tests) gets denied by
   the `PreToolUse` hook — captured live, not assumed.
3. Confirm `stream-json` + Monitor actually shows live steps, or document
   that it doesn't and plain json is what's used.
4. Confirm the new settings flag defaults off and the CLAUDE.md section
   correctly no-ops when it's false/missing, mirroring the opencode
   add-on's install.sh test (fresh install, flag off by default, verified).
