# UnSkilled

A minimal desktop coding-agent harness for Windows, macOS, and Linux, with the [skilled](../../README.md) workflow built in.

You open a project folder, start a thread, and work with Claude inside it. Typing `/` shows skilled's workflow skills (`/skilled-setup`, `/domain-interview`, `/implement`, …). The agent picks up skilled's design and review skills (`tdd`, `review-diff`, `release-safety`, …) by itself as the work calls for them.

## How skills get in without costing context

The app follows the contract in [HARNESS.md](../../HARNESS.md):

- **Model-invoked skills (15)** go to Claude as a local plugin, generated into the app's data folder from the bundled `skills/`. Claude lists them and loads each one only when it needs it. Inside a plugin they are named `skilled:<name>`, so the app rewrites every `Call the Skill tool with "x"` in the plugin's copies to match.
- **User-invoked skills (23)** never go to the agent. The `/` menu lists them from `skills.json`. When you pick one, the app puts the skill's body into your message, the same thing Claude Code does for a typed `/command`.
- **git-guardrails** runs as a pre-tool hook on every shell command the agent issues. It needs Python 3; without it the guard is off.

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

CI runs typecheck, tests, packaging, and a smoke test of the packaged app on all three OSes. The smoke test (`--smoke`) checks four things: the window loads, the preload bridge works, the skills catalog answers, and the bundled Claude Code binary runs.

## Layout

| Path | What it is |
| :--- | :--- |
| `src/main/index.ts` | Electron entry point: window, IPC, smoke mode |
| `src/main/service.ts` | Everything the UI can ask for. No Electron imports, so it runs in tests |
| `src/main/agents/` | The `AgentDriver` interface and the Claude driver (Agent SDK) |
| `src/main/skills/` | Reading `skills.json`, generating the plugin, composing prompts |
| `src/main/db.ts` | SQLite store (`node:sqlite`): projects, threads, events |
| `src/main/git.ts` | Working-tree diff for the Changes panel |
| `src/main/guard.ts` | git-guardrails pre-tool hook |
| `src/preload/` | The `window.unskilled` bridge |
| `src/shared/types.ts` | The main ↔ renderer contract |
| `src/renderer/` | React UI. Hand-written CSS in `styles/app.css`, state in `store.ts` |

## Stack

Electron 44 (the same Chromium on every OS, which the built-in browser needs), React 19, Vite via electron-vite, Zustand, `node:sqlite`, and the Claude Agent SDK. The UI uses no component library: system fonts, macOS vibrancy and Windows Mica, light and dark themes from CSS tokens.

## Roadmap

- **Milestone 2:** Codex (app-server) and a generic ACP driver, which covers deepseek-harness, Gemini CLI, and Cursor through one adapter. Also the built-in browser pane with `browser_*` tools, so `verify-in-browser` runs where you can watch it, and a terminal tab.
- **Milestone 3:** code signing and notarization, auto-update, and a per-thread view of token usage.
