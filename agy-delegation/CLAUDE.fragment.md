<!-- skilled:agy-delegation:start -->
## agy (Antigravity) web-research delegation (optional add-on)

This section only applies when `.claude/settings.json` has
`"skilledAgyDelegation": true`. If that key is missing or `false`, ignore
this section entirely — the `/agy-research` command below checks it itself
and refuses to run otherwise.

When enabled: `agy` (Google's Antigravity CLI, `agy` on PATH) is a second,
independent delegation lane alongside opencode, for one narrow job — fast,
read-only web research using Gemini Flash. It is not a general
implementation worker.

**Decide the lane yourself, per task, before delegating — don't default to
one or ask the user to pick.** If opencode-delegation is also enabled, route
by what the task actually needs: live web search, URL fetching, or
browser-driven exploration/testing → `agy`. Codebase research,
implementation, verification, or anything needing file edits or shell
commands beyond search/fetch → opencode. A single request can span both —
e.g. "check how a competitor's signup flow works and match it here" is agy
for the research half, opencode for the implementation half — delegate each
half to the lane suited for it rather than forcing one lane through the
whole task.

### Invocation

```
agy -p "<self-contained web-research brief>" --model gemini-3.8-flash-high --output-format stream-json
```

Same background + Monitor discipline as opencode delegation: launch via the
Bash tool's `run_in_background: true`, redirecting output to
`.ai/tmp/<name>.log` (gitignored, inside the project — not `/tmp`), then
immediately attach `Monitor` to that file. `--output-format stream-json`
emits one JSON object per line
with a `step_update` for each tool call
(`.step_update.tool_name`, `.step_update.state`,
`.step_update.tool_info.parameters`) — pipe through `jq --unbuffered -r`
the same way as the opencode `--format json` pattern, e.g.:
`jq --unbuffered -r 'if .event=="step_update" and .step_update.step_type=="tool" then "[tool] \(.step_update.tool_name): \(.step_update.state)" elif .event=="result" then "[done] \(.result.response)" else empty end'`

For a one-shot call with no need for live steps, `--output-format json`
returns a single result object instead. A denied-tool call can take much
longer to return than a clean call (~30s vs. ~2-3s observed) — budget
timeouts accordingly, it isn't a hang.

### What it can and can't do — read this before writing a brief

Scope every brief to **read-only web research**: `search_web`,
`read_url_content`, and — if genuinely needed — the native `browser_*`
tools for interactive testing (`open_browser_url`, `browser_click_element`,
`capture_browser_screenshot`, `execute_browser_javascript`, etc.). Not file
edits, not `run_command`, not anything that writes.

**Known permission gap — do not assume parity with opencode's guardrails
here.** opencode's workers have real, verified technical gates (bash
command patterns, credential-file blocking). agy does not have an
equivalent for local file reads: its `PreToolUse` hooks do not fire in
headless (`-p`) mode — tested and confirmed non-functional, not just
undocumented — and its permissions are one flat global list
(`~/.gemini/antigravity-cli/settings.json`), not scoped per role or per
path. `run_command` and any write tool remain genuinely blocked in headless
mode by agy's own base permission system as long as they're never
pre-approved (verified live). But `view_file`/`grep_search`/`list_dir`/
`find_by_name` on files *inside* whatever workspace agy is pointed at have
**no gate at all** — no prompt, no hook. Never write a brief that gives agy
a reason to open a local file, and never point `--add-dir` at a workspace
containing real secrets unless the task genuinely requires it.

### Workflow

Same shape as opencode delegation: a precise and thorough brief (exact
objective, exact scope, expected output format) → launch in background with
Monitor attached → evaluate the result against the brief yourself, don't
just relay it. If something's wrong, don't just retry blindly in the same
lane: decide whether agy should retry with a clearer brief, or whether the
task actually belongs to opencode instead (e.g. agy's web research turned up
something that needs verifying against the actual codebase, or opencode hit
something that needs live web/browser context agy is better suited for) —
hand it back to whichever lane actually fits the next step, rather than
forcing the wrong tool to finish the job.

### Rules

- Same `run_in_background` + immediate `Monitor` discipline as opencode
  delegation — no manual polling loops, no silent multi-minute waits.
- Never let agy's report be the final word — verify it yourself, same as
  opencode's workers.
- If agy fails or returns garbage: retry once with a clearer brief, then do
  it yourself or report the failure honestly.
- `agy -p` runs headless, so an unapproved tool call is auto-denied, not
  prompted for — it fails visibly. If that happens, narrow the brief to what
  `search_web`/`read_url_content`/`browser_*` can actually do; never work
  around it by pre-approving `run_command` or a write tool in agy's global
  permission list just to unblock one delegation call — that pre-approval
  is permanent and machine-wide, not scoped to this call.
<!-- skilled:agy-delegation:end -->
