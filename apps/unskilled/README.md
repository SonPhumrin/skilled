# UnSkilled

A minimal desktop coding-agent harness for Windows, macOS, and Linux, with the [skilled](../../README.md) workflow built in.

You open a project folder, start a thread, and work with Claude inside it. Typing `/` shows skilled's workflow skills (`/skilled-setup`, `/domain-interview`, `/implement`, …). The agent picks up skilled's design and review skills (`tdd`, `review-diff`, `release-safety`, …) by itself as the work calls for them.

## How skills get in without costing context

The app follows the contract in [HARNESS.md](../../HARNESS.md):

- **Model-invoked skills (15)** go to Claude as a local plugin, generated into the app's data folder from the bundled `skills/`. Claude lists them and loads each one only when it needs it. Inside a plugin they are named `skilled:<name>`, so the app rewrites every `Call the Skill tool with "x"` in the plugin's copies to match.
- **User-invoked skills (23)** never go to the agent. The `/` menu lists them from `skills.json`. When you pick one, the app puts the skill's body into your message, the same thing Claude Code does for a typed `/command`.
- **git-guardrails** runs as a pre-tool hook on every shell command the agent issues. It needs Python 3; without it the guard is off.

## Agents

Every thread runs one agent, picked in the header. Switching agents starts a fresh conversation, because sessions don't carry across agents.

- **Claude** (always there) uses the Claude Agent SDK. It gets skilled's model-invoked skills as a plugin, plus the browser tools.
- **Any agent that speaks ACP** (the [Agent Client Protocol](https://agentclientprotocol.com)) goes through one generic driver. Each thread keeps its agent process alive between turns and resumes the stored session after a restart when the agent supports it. Models come from the agent's own `model` config option.
  - **DeepSeek** appears when `dsh` ([deepseek-harness](https://github.com/deepseek-ai/deepseek-harness), `npm i -g @deepseek-ai/dsh`) is on your PATH. It runs as `dsh --profile acp` and uses your dsh configuration and `DEEPSEEK_API_KEY`. skilled's model-invoked skills reach it through `DSH_BUNDLED_SKILL_DIR`, so nothing is written into your project.
  - **Cursor** appears when `cursor-agent` is on your PATH.
  - **Your own:** add them to `agents.json` in the app's data folder. An entry with a preset's id replaces the preset:

    ```json
    { "agents": [{ "id": "gemini", "label": "Gemini", "command": "gemini", "args": ["--experimental-acp"], "env": {} }] }
    ```

  The permission modes carry over. Ask asks for every tool call. Auto-edit allows reads and file edits without asking. Full allows everything.

The `/` menu works the same for every agent, since the app composes the skill's text itself. The browser tools reach ACP agents too, if the agent accepts HTTP MCP servers (deepseek-harness does). The app serves them from a local MCP server on 127.0.0.1, which only accepts requests carrying a per-run token.

## The built-in browser

The Browser tab (⌘⇧B) is a real Chromium page beside the thread: open your dev server there, and the agent can drive the same page. Once you've opened the tab, the agent gets seven tools: `browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_eval`, `browser_logs`, and `browser_screenshot`. Before that, they aren't sent at all, so they cost no context.

- Snapshots are text with element refs (`[e3] button "Sign in"`), a fraction of a screenshot's tokens. Screenshots are saved to files, and the model sees the image only when it asks.
- Clicks are real mouse events through the Chrome DevTools Protocol. Console errors, uncaught exceptions, and failed or 4xx/5xx requests are captured as they happen.
- `verify-in-browser` picks these tools up automatically, so a UI check runs where you can watch it.
- **Pick an element** with the target button: hover to highlight, click to add the element's selector, text, HTML, and a cropped screenshot to your message. Esc cancels.
- The pane has no Node access and no preload, and loads only http(s), file, and data URLs. `browser_eval` asks before it runs in Ask mode; the other tools don't.

## Running it

From the repo root:

```bash
pnpm install
pnpm dev          # Electron with hot reload
pnpm test         # unit tests
pnpm typecheck
```

Claude uses your existing Claude Code login (run `claude` once in a terminal), or `ANTHROPIC_API_KEY`. It reads your usual Claude Code settings and `CLAUDE.md`.

To look at the UI without Electron or an agent: `pnpm --filter unskilled preview:ui`, then open `http://localhost:5199/?state=thread`. Other states: `permission`, `running`, `project`, `welcome`. This uses canned data from `src/renderer/src/mock.ts`.

## Building installers

`pnpm --filter unskilled dist` builds for the OS you're on: a `.dmg`/`.zip` on macOS, an NSIS `.exe` on Windows, an `.AppImage` on Linux. To build all three, push a tag `unskilled-v<version>`; the `release-unskilled` workflow builds them and uploads them as artifacts. Builds are unsigned until signing secrets are added.

CI runs typecheck, tests, packaging, and a smoke test of the packaged app on all three OSes. The smoke test (`--smoke`) checks five things: the window loads, the preload bridge works, the skills catalog answers, the bundled Claude Code binary runs, and the browser tools can open a page, type, click, and read the console. Set `UNSKILLED_SMOKE_SCREENSHOT=<file.png>` to also save a screenshot of the window.

## Layout

| Path | What it is |
| :--- | :--- |
| `src/main/index.ts` | Electron entry point: window, IPC, smoke mode |
| `src/main/service.ts` | Everything the UI can ask for. No Electron imports, so it runs in tests |
| `src/main/agents/` | The `AgentDriver` interface, the Claude driver (Agent SDK), the ACP driver (`acp/`), and the agent registry |
| `src/main/skills/` | Reading `skills.json`, generating the plugin, composing prompts |
| `src/main/db.ts` | SQLite store (`node:sqlite`): projects, threads, events |
| `src/main/git.ts` | Working-tree diff for the Changes panel |
| `src/main/mcp-http.ts` | The harness's tools as a local MCP server, for ACP agents |
| `src/main/browser/` | The browser pane's controller (DevTools Protocol), page snapshots, and the agent's `browser_*` tools |
| `src/main/guard.ts` | git-guardrails pre-tool hook |
| `src/preload/` | The `window.unskilled` bridge |
| `src/shared/types.ts` | The main ↔ renderer contract |
| `src/renderer/` | React UI. Hand-written CSS in `styles/app.css`, state in `store.ts` |

## Stack

Electron 44 (the same Chromium on every OS, which the built-in browser needs), React 19, Vite via electron-vite, Zustand, `node:sqlite`, and the Claude Agent SDK. The UI uses no component library: system fonts, macOS vibrancy and Windows Mica, light and dark themes from CSS tokens.

## Roadmap

- **Milestone 2:** ~~the built-in browser pane~~, ~~the generic ACP driver~~, and ~~browser tools for ACP agents~~, and ~~the element picker~~ (done). Still to come: Codex (app-server) and a terminal tab.
- **Milestone 3:** code signing and notarization, auto-update, and a per-thread view of token usage.
