---
name: verify-in-browser
description: "Drive the running app in a real browser to check the current ticket's acceptance criteria: the flow works, the UI renders right, translated copy shows real strings. Use after implementing and before static review, or when asked to \"check this in the browser\" or \"verify the UI\"."
---

Checks a ticket's acceptance criteria by actually driving the app, not by reading the diff. Reading catches whether the code looks right; this catches whether the screen renders, the flow completes, and the copy shown is the real translated string. Scoped to what the current ticket touches — not a full-app regression, accessibility, or performance sweep. If a project already has a separate full-QA browser-testing skill installed, that one is for sweeping the whole app on request; this one only checks the criteria of what was just built.

Web only for now. A mobile ticket needs a different driver than a browser entirely — see **Not now** below.

## Process

### 1. Confirm this applies

Skip, saying why in one line, when: no acceptance criteria describe user-visible behavior, or there's no running app to check it against. Applies when the ticket's criteria describe something a person would see or click: a functional flow, a screen or UI state, or copy/translated text.

### 2. Get the criteria to check

- If you already have the ticket or spec in hand — you just built it — use its `## Acceptance criteria` checklist directly. Each `- [ ]` line is one test case.
- If invoked on its own with no ticket in hand, ask the user which ticket or spec to check against. Don't invent criteria to verify.
- A criterion with nothing to click through in a browser (a migration, an internal refactor, a data constraint) isn't a browser test case. List it separately as "not browser-checkable" rather than dropping it silently.

### 3. Make sure there's something to test against

- If the harness provides built-in browser tools (`browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_eval`, `browser_logs`; see `HARNESS.md` in the skilled repo), drive its in-app browser with those and skip the `agent-browser` steps below: the user watches the run in the same pane. Steps 4 and 5 are unchanged.
- Otherwise, confirm `agent-browser` is on `PATH` (`agent-browser --version`). If it's missing, install the pinned version — `npm i -g agent-browser@0.37.1 && agent-browser install` — never an unpinned `npm i -g agent-browser`, which pulls whatever's newest on npm at install time and makes this skill's behavior depend on when it happens to run. Bump the pinned version deliberately (update it here, in this line, after checking `npm view agent-browser versions`) once a newer release has been verified against this skill's own process — not silently on every fresh install.
- Confirm the app is reachable at its dev URL. If nothing is running, say what command starts it and stop there. Don't guess a port or silently start one.
- With `agent-browser`, load `agent-browser skills get core` once for the command reference before issuing any commands. Use only the harness's browser tools or `agent-browser`, never Playwright, Puppeteer, or another browser tool, so every run is reproducible with the same driver.

### 4. Run each criterion

For every browser-checkable criterion:

- Open the screen it describes, snapshot for element refs, perform the action.
- Assert the specific result the criterion states — a URL, a visible message, an element's state.
- Check the console and failed network requests for that screen (`browser_logs`, or `agent-browser`'s console output). An uncaught error or a failed request the criterion depends on is a fail even if the screen looks right.
- If the criterion is about copy or translation, repeat the same steps once per locale the project supports, asserting the real translated string renders, not a raw i18n key.
- Capture one screenshot as evidence and record pass/fail against the criterion's own wording.

### 5. Report

One line per criterion: pass/fail, screenshot path, locale if relevant. List anything marked "not browser-checkable" separately, not folded into the pass/fail count.

Surface failures before anything else that follows — including before a static review — and ask whether to fix now or continue with the failure flagged.

## Not now

Mobile app testing is out of scope here: `agent-browser` drives a browser, not a native app, and a mobile ticket needs an entirely different driver. Don't add a driver abstraction ahead of that need — when mobile testing is actually asked for, it's a new skill built around its own driver, not a parameter bolted onto this one.
