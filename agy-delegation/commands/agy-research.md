---
description: Delegate read-only web research to agy (Antigravity CLI, Gemini Flash) - saves Claude tokens
allowed-tools: Bash(agy:*)
---

First, read `.claude/settings.json` in this project. If the top-level key `skilledAgyDelegation` is not exactly `true`, tell the user this add-on is off (edit `.claude/settings.json` and set `"skilledAgyDelegation": true` to enable it) and stop — do not run `agy`.

Delegate the following web-research task to `agy` (Gemini Flash) using the invocation pattern and rules from this project's CLAUDE.md `agy-delegation` section:

TASK: $ARGUMENTS

Scope the brief to read-only web research only (`search_web`, `read_url_content`, and native `browser_*` tools if interactive testing is needed) — never file edits, `run_command`, or anything that writes. Launch via the Bash tool with `run_in_background: true`, attach `Monitor` immediately. Evaluate the result yourself against the brief before relaying it back.
