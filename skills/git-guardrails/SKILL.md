---
name: git-guardrails
description: Install hooks that block destructive git, database, and infrastructure commands before they run.
disable-model-invocation: true
---

# Setup Git Guardrails

Sets up a PreToolUse hook that intercepts and blocks dangerous git, database, and infrastructure commands before the agent executes them. The hook is a standard-library Python script, so it runs the same on Linux, macOS and Windows (under PowerShell too).

## What Gets Blocked

- `git push` (all variants including `--force`)
- `git reset --hard`
- `git clean` with any force flag, any combination/order (`-f`, `-fd`, `-df`, `-fdx`, `--force`, ...)
- `git branch -D` / `git branch --delete --force`
- `git checkout .` / `git restore .` (but not `git checkout -p .` / `--patch`, which prompts per-hunk rather than discarding silently)

Data and infrastructure that no git command can bring back:

- `terraform destroy` / `tofu destroy` / `terraform apply -destroy`
- `prisma migrate reset`, `rails db:drop` / `db:reset`, `dropdb`
- `DROP DATABASE|SCHEMA|TABLE` or `TRUNCATE TABLE` sent through `psql`, `mysql`, `sqlite3`, `mongosh`, `sqlcmd`
- `docker volume rm` / `prune`, `kubectl delete namespace`

These match wherever they appear in a segment, so `npx prisma migrate reset` and `bundle exec rails db:drop` are caught too.

The script tokenizes each `&&`/`;`/`|`-separated segment of the command and matches on the actual git subcommand and its flags — not a raw substring of the whole command line — so `git -C . push`, chained commands, and unusual flag orderings are still caught, and text that merely *mentions* one of these phrases (e.g. inside a commit message) is not a false positive. A payload the hook can't parse is blocked rather than silently allowed.

When blocked, the agent sees a message telling it that it does not have authority to access these commands.

## Steps

### 1. Ask scope

Ask the user: install for **this project only** (`.claude/settings.json`) or **all projects** (`~/.claude/settings.json`)?

### 2. Copy the hook script

The bundled script is at: [scripts/block-dangerous-git.py](scripts/block-dangerous-git.py)

Copy it to the target location based on scope:

- **Project**: `.claude/hooks/block-dangerous-git.py`
- **Global**: `~/.claude/hooks/block-dangerous-git.py`

On macOS/Linux, make it executable with `chmod +x`. The hook command below calls it through `python3` so it works without that too; on Windows, where the interpreter is usually `python`, use `python` in the command instead.

### 3. Add hook to settings

Add to the appropriate settings file. The matcher covers every shell tool name the supported harnesses use: Claude Code's `Bash`, and `bash` / `pwsh` in deepseek-harness.

**Project** (`.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|bash|pwsh",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-dangerous-git.py"
          }
        ]
      }
    ]
  }
}
```

**Global** (`~/.claude/settings.json`): the same, with `"command": "python3 ~/.claude/hooks/block-dangerous-git.py"`.

If the settings file already exists, merge the hook into the existing `hooks.PreToolUse` array. Don't overwrite other settings.

**deepseek-harness** reads this same Claude Code format through its `@deepseek-ai/dsh-hooks-claude-code` plugin, which no shipped profile mounts by default: add it to the profile patch (`$DSH_HOME/cordis.patch.yml`) with `configPath` pointing at the settings file above. For any other harness, see `HARNESS.md` in the skilled repo: it needs a pre-tool hook that passes `{"tool_input": {"command": ...}}` on stdin and treats exit 2 as deny.

### 4. Ask about customization

Ask if user wants to add or remove any patterns from the blocked list. Edit the copied script accordingly.

### 5. Verify

Run a quick test:

```bash
echo '{"tool_input":{"command":"git push origin main"}}' | python3 <path-to-script>
```

Should exit with code 2 and print a BLOCKED message to stderr.
