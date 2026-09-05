---
name: verify-in-browser
description: Drive the running app in a real browser to check a ticket's acceptance criteria actually hold — the flow works, the screen/UI renders right, and translated copy shows the real string, not a raw key. Scoped to the current ticket, not a full regression sweep. Use after finishing an implementation and before static review, or when the user asks to "check this in the browser," "verify the UI," or "check the translations."
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

- Confirm `agent-browser` is on `PATH` (`agent-browser --version`). If it's missing, install it fresh — `npm i -g agent-browser && agent-browser install` — never pin or vendor a copy, so this always runs whatever's current on npm regardless of machine.
- Confirm the app is reachable at its dev URL. If nothing is running, say what command starts it and stop there. Don't guess a port or silently start one.
- Load `agent-browser skills get core` once for the command reference before issuing any commands. Never fall back to Playwright, Puppeteer, or another browser tool.

### 4. Run each criterion

For every browser-checkable criterion:

- Open the screen it describes, snapshot for element refs, perform the action.
- Assert the specific result the criterion states — a URL, a visible message, an element's state.
- If the criterion is about copy or translation, repeat the same steps once per locale the project supports, asserting the real translated string renders, not a raw i18n key.
- Capture one screenshot as evidence and record pass/fail against the criterion's own wording.

### 5. Report

One line per criterion: pass/fail, screenshot path, locale if relevant. List anything marked "not browser-checkable" separately, not folded into the pass/fail count.

Surface failures before anything else that follows — including before a static review — and ask whether to fix now or continue with the failure flagged.

## Not now

Mobile app testing is out of scope here: `agent-browser` drives a browser, not a native app, and a mobile ticket needs an entirely different driver. Don't add a driver abstraction ahead of that need — when mobile testing is actually asked for, it's a new skill built around its own driver, not a parameter bolted onto this one.
