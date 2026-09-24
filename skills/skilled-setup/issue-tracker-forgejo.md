# Issue tracker: Forgejo / Gitea

Issues and specs for this repo live as Forgejo/Gitea issues on `<host>`. Use the [`tea`](https://gitea.com/gitea/tea) CLI, or the REST API directly when `tea` isn't installed.

## Authentication

Take the token from the local git credential store rather than asking for one:

```bash
TOKEN=$(printf 'protocol=https\nhost=<host>\n\n' | GIT_TERMINAL_PROMPT=0 git credential fill | sed -n 's/^password=//p')
```

`GIT_TERMINAL_PROMPT=0` makes a missing credential fail instead of hanging on a prompt. Keep the token in the shell variable: never echo it, and never write it into a file, an issue, or a commit.

- **REST API (nothing to install)**: send `Authorization: token $TOKEN` to `https://<host>/api/v1/...`.
- **`tea` CLI**: log in once with `tea login add --name <login-name> --url https://<host> --token "$TOKEN"`. After that `tea` reads the token from its own config and needs no header.

## Conventions

REST paths below are relative to `https://<host>/api/v1/`. `tea api` takes the same paths and fills `{owner}` and `{repo}` from the current clone.

- **Create an issue**: `tea issue create --title "..." --description "..." --labels "a,b"`. Use `--description-file -` with a heredoc for multi-line bodies. _(REST: `POST repos/{owner}/{repo}/issues` with `{"title": "...", "body": "..."}`.)_
- **Read an issue**: `tea issue <number> --comments`. Add `-o json` for machine-readable output. _(REST: `GET repos/{owner}/{repo}/issues/<number>` and `.../comments`.)_
- **List issues**: `tea issue list --state open --labels "..." -o json`. _(REST: `GET repos/{owner}/{repo}/issues?state=open&type=issues&labels=...`.)_
- **Comment on an issue**: `tea comment <number> "..."`. _(REST: `POST repos/{owner}/{repo}/issues/<number>/comments` with `{"body": "..."}`.)_
- **Apply / remove labels**: `tea issue edit <number> --add-labels "..."` / `--remove-labels "..."`. _(REST: `POST` / `DELETE repos/{owner}/{repo}/issues/<number>/labels`.)_
- **Close**: `tea issue close <number>`. `tea` can't attach a closing comment, so post the explanation with `tea comment` first. _(REST: `PATCH repos/{owner}/{repo}/issues/<number>` with `{"state": "closed"}`.)_

**Labels must already exist.** `tea` silently drops any label name the repo doesn't have. Before applying one for the first time, create it with `tea labels create --name "..." --color "#ededed"`.

Infer the repo from `git remote -v`. `tea` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs go through the same labels and states as issues, using the `tea pr` equivalents:

- **Read a PR**: `tea pr <number> --comments`. For the diff, use `tea api 'repos/{owner}/{repo}/pulls/<number>.diff'`.
- **List external PRs for triage**: `tea pr list --state open -o json`, then keep only PRs whose author isn't a collaborator on the repo (`GET repos/{owner}/{repo}/collaborators/<user>` returns 204 for collaborators). That leaves a contributor's PR and drops a maintainer's in-flight work.
- **Comment / label / close**: `tea comment <number> "..."`, `tea issue edit <number> --add-labels`/`--remove-labels` (a PR is an issue for labelling), `tea pr close <number>`.

Forgejo/Gitea shares one number space across issues and PRs, as GitHub does, so a bare `#42` could be either. Resolve it with `tea pr 42` and fall back to `tea issue 42`.

## When a skill says "publish to the issue tracker"

Create a Forgejo/Gitea issue.

## When a skill says "fetch the relevant ticket"

Run `tea issue <number> --comments`.

## Wayfinding operations

Used by `/decision-map`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `decision-map:map`, holding the Notes / Decisions-so-far / Fog body, plus a task list of its children (`- [ ] #<child>`) in map order. `tea issue create --title "[Map] <effort>" --labels "decision-map:map"`.
- **Child ticket**: an issue with `Part of #<map>` at the top of its body and a `decision-map:<type>` label (`research`/`prototype`/`interview`/`task`), added to the map's task list. Once claimed, it is assigned to the driving dev.
- **Blocking**: Forgejo/Gitea's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `tea api -X POST 'repos/{owner}/{repo}/issues/<child>/dependencies' -F index=<blocker>`, where `<blocker>` is the blocker's issue number. Dependencies can be switched off per repo. If the call is refused, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child's body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: walk the map's task list in order, keeping open children. Drop any child that has an assignee or an open blocker. A blocker is open if it appears in `tea api 'repos/{owner}/{repo}/issues/<child>/dependencies'` with `"state": "open"`, or is an open issue named in the `Blocked by` line. The first child left is the frontier.
- **Claim**: `tea issue edit <n> --add-assignees <your-login>`, the session's first write. `tea whoami` gives the login.
- **Resolve**: `tea comment <n> "<answer>"`, then `tea issue close <n>`. Tick the child in the map's task list and append a context pointer (gist + link) to its Decisions-so-far.
