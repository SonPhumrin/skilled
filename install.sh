#!/usr/bin/env bash
# Install skilled into a single project, for every harness that reads the
# Agent Skills format there: Claude Code, OpenCode, and Antigravity. Every
# location this writes is project-scoped -- nothing here touches a global
# (home-directory) config, on any harness.
#
# Usage:
#   ./install.sh /path/to/project              install into that project
#   ./install.sh /path/to/project --uninstall  remove what this created
#
# What gets written, and why each one is needed:
#   <project>/.claude/skills       - Claude Code's native project scope.
#   <project>/.agents/skills       - Antigravity's native project scope.
#   <project>/.agents/skills.json  - Antigravity also needs this. Its own
#                                     logs show its default .agents/skills/
#                                     scan can go stale on a symlinked folder
#                                     ("Slash commands unchanged, skipping
#                                     update" even after a real change), and
#                                     its own docs recommend exactly this file
#                                     for skills living outside the default
#                                     discovery locations. Belt and suspenders
#                                     with the symlinks above, not a
#                                     replacement for them.
#   <project>/opencode.json        - Required for OpenCode, not optional: its
#                                     own embedded docs are explicit that its
#                                     external-skill auto-load only scans
#                                     ~/.claude/ and ~/.agents/ (home
#                                     directory, global) and NEVER a project's
#                                     .claude/skills or .agents/skills. The
#                                     "skills": {"paths": [...]} entry this
#                                     writes is OpenCode's own project-scoped
#                                     mechanism -- there is no directory-scan
#                                     equivalent for it at the project level.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$REPO_DIR/skills"

if [ $# -lt 1 ]; then
  echo "Usage: $0 /path/to/project [--uninstall]" >&2
  exit 1
fi

PROJECT_PATH="$1"
MODE="install"
if [ "${2:-}" = "--uninstall" ]; then
  MODE="uninstall"
fi

if [ ! -d "$PROJECT_PATH" ]; then
  echo "error: $PROJECT_PATH is not a directory" >&2
  exit 1
fi
PROJECT_PATH="$(cd "$PROJECT_PATH" && pwd)"

TARGETS=(
  "$PROJECT_PATH/.claude/skills"
  "$PROJECT_PATH/.agents/skills"
)

link_all() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  local linked=0
  for skill_path in "$SKILLS_DIR"/*/; do
    local name target
    name="$(basename "$skill_path")"
    target="${skill_path%/}"
    ln -sfn "$target" "$target_dir/$name"
    linked=$((linked + 1))
  done
  echo "  $target_dir  ($linked skills)"
}

unlink_all() {
  local target_dir="$1"
  [ -d "$target_dir" ] || return 0
  local removed=0
  for skill_path in "$SKILLS_DIR"/*/; do
    local name link target
    name="$(basename "$skill_path")"
    target="${skill_path%/}"
    link="$target_dir/$name"
    if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
      rm "$link"
      removed=$((removed + 1))
    fi
  done
  echo "  $target_dir  (removed $removed)"
}

# Antigravity-specific: register $SKILLS_DIR in <project>/.agents/skills.json
# via its documented { "entries": [{ "path": ... }] } schema. Merges into an
# existing file rather than overwriting it, so a project's own entries (or
# ones from other tools) survive.
write_skills_json() {
  local agents_dir="$1"
  local json_file="$agents_dir/skills.json"
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  warning: python3 not found, skipped $json_file (Antigravity needs it to see these skills)" >&2
    return 0
  fi
  mkdir -p "$agents_dir"
  python3 - "$json_file" "$SKILLS_DIR" <<'PYEOF'
import json, os, sys

json_file, skills_dir = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(json_file):
    content = open(json_file).read().strip()
    if content:
        data = json.loads(content)

entries = data.setdefault("entries", [])
if not any(e.get("path") == skills_dir for e in entries):
    entries.append({"path": skills_dir})

with open(json_file, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF
  echo "  $json_file  (registered $SKILLS_DIR)"
}

remove_skills_json_entry() {
  local agents_dir="$1"
  local json_file="$agents_dir/skills.json"
  [ -f "$json_file" ] || return 0
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  warning: python3 not found, left $json_file untouched" >&2
    return 0
  fi
  python3 - "$json_file" "$SKILLS_DIR" <<'PYEOF'
import json, os, sys

json_file, skills_dir = sys.argv[1], sys.argv[2]
content = open(json_file).read().strip()
data = json.loads(content) if content else {}
entries = [e for e in data.get("entries", []) if e.get("path") != skills_dir]

if entries:
    data["entries"] = entries
    with open(json_file, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
elif data.get("inherits") or (set(data.keys()) - {"entries"}):
    data.pop("entries", None)
    with open(json_file, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
else:
    os.remove(json_file)
PYEOF
  echo "  $json_file  (unregistered $SKILLS_DIR)"
}

# OpenCode-specific: register $SKILLS_DIR under "skills": {"paths": [...]}
# in the project's opencode.json. OpenCode checks ./opencode.json,
# ./opencode.jsonc, then .opencode/opencode.json, in that order; this edits
# whichever already exists, or creates ./opencode.json if none do. A
# pre-existing .jsonc is never auto-edited (comments don't survive a JSON
# round-trip) -- printed as a manual instruction instead.
write_opencode_config() {
  local project="$1"
  local target=""
  if [ -f "$project/opencode.json" ]; then
    target="$project/opencode.json"
  elif [ -f "$project/opencode.jsonc" ]; then
    echo "  $project/opencode.jsonc exists; skilled won't auto-edit JSONC (comments don't survive a rewrite)." >&2
    echo "    Add by hand: {\"skills\": {\"paths\": [\"$SKILLS_DIR\"]}}" >&2
    return 0
  elif [ -f "$project/.opencode/opencode.json" ]; then
    target="$project/.opencode/opencode.json"
  else
    target="$project/opencode.json"
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    echo "  warning: python3 not found, skipped $target (OpenCode needs it to see these project skills)" >&2
    return 0
  fi

  python3 - "$target" "$SKILLS_DIR" <<'PYEOF'
import json, os, sys

json_file, skills_dir = sys.argv[1], sys.argv[2]
created = not os.path.exists(json_file)
data = {}
if not created:
    content = open(json_file).read().strip()
    if content:
        data = json.loads(content)
if created:
    data["$schema"] = "https://opencode.ai/config.json"

skills = data.setdefault("skills", {})
paths = skills.setdefault("paths", [])
if skills_dir not in paths:
    paths.append(skills_dir)

with open(json_file, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF
  echo "  $target  (registered $SKILLS_DIR)"
}

remove_opencode_config_entry() {
  local project="$1"
  local target=""
  for candidate in "$project/opencode.json" "$project/.opencode/opencode.json"; do
    if [ -f "$candidate" ]; then
      target="$candidate"
      break
    fi
  done
  [ -n "$target" ] || return 0

  if ! command -v python3 >/dev/null 2>&1; then
    echo "  warning: python3 not found, left $target untouched" >&2
    return 0
  fi

  python3 - "$target" "$SKILLS_DIR" <<'PYEOF'
import json, os, sys

json_file, skills_dir = sys.argv[1], sys.argv[2]
content = open(json_file).read().strip()
data = json.loads(content) if content else {}
skills = data.get("skills", {})
paths = [p for p in skills.get("paths", []) if p != skills_dir]

if paths:
    skills["paths"] = paths
    data["skills"] = skills
else:
    skills.pop("paths", None)
    if skills:
        data["skills"] = skills
    else:
        data.pop("skills", None)

if set(data.keys()) - {"$schema"}:
    with open(json_file, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
else:
    os.remove(json_file)
PYEOF
  echo "  $target  (unregistered $SKILLS_DIR)"
}

# Report nested roots this install did NOT reach: git submodules (a separate
# repo with its own root -- nothing written at $PROJECT_PATH is visible to a
# session opened inside one) and monorepo workspace packages (a directory
# someone might launch an agent from directly, same blind spot for a
# different reason). Reported only, never auto-installed: whether a nested
# path is a real work surface or a vendored dependency/library needs a human
# (or an agent) to judge, not a glob match.
detect_nested_roots() {
  local project="$1"
  local -a found=()

  if [ -f "$project/.gitmodules" ]; then
    while IFS= read -r sub_path; do
      [ -n "$sub_path" ] && [ -d "$project/$sub_path" ] && found+=("$project/$sub_path")
    done < <(git -C "$project" config -f .gitmodules --get-regexp '\.path$' 2>/dev/null | awk '{print $2}')
  fi

  if command -v python3 >/dev/null 2>&1 && [ -f "$project/package.json" ]; then
    while IFS= read -r pattern; do
      [ -n "$pattern" ] || continue
      for d in "$project"/$pattern/; do
        [ -d "$d" ] && [ -f "${d}package.json" ] && found+=("${d%/}")
      done
    done < <(python3 -c "
import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
ws = data.get('workspaces')
if isinstance(ws, dict):
    ws = ws.get('packages', [])
for pattern in (ws or []):
    print(pattern)
" "$project/package.json" 2>/dev/null)
  fi

  if [ -f "$project/pnpm-workspace.yaml" ]; then
    while IFS= read -r pattern; do
      [ -n "$pattern" ] || continue
      for d in "$project"/$pattern/; do
        [ -d "$d" ] && [ -f "${d}package.json" ] && found+=("${d%/}")
      done
    done < <(sed -n 's/^[[:space:]]*-[[:space:]]*['"'"'"]\?\([^'"'"'"#]*\)['"'"'"]\?[[:space:]]*$/\1/p' "$project/pnpm-workspace.yaml")
  fi

  [ ${#found[@]} -eq 0 ] && return 0

  local -a unique=()
  local f
  for f in "${found[@]}"; do
    local seen=0 u
    for u in "${unique[@]:-}"; do [ "$u" = "$f" ] && seen=1 && break; done
    [ "$seen" -eq 0 ] && unique+=("$f")
  done

  echo
  echo "Found ${#unique[@]} nested root(s) this install does not reach (each is its"
  echo "own project scope to Claude Code / OpenCode / Antigravity if an agent is ever"
  echo "launched from inside it directly -- a submodule is a separate git repo, a"
  echo "workspace package is a directory someone might cd into). Not installed"
  echo "automatically -- only run this for the ones that are real work surfaces,"
  echo "not vendored dependencies:"
  for f in "${unique[@]}"; do
    echo "  ./install.sh $f"
  done
}

if [ "$MODE" = "uninstall" ]; then
  echo "Removing skilled from $PROJECT_PATH:"
  for dir in "${TARGETS[@]}"; do unlink_all "$dir"; done
  remove_skills_json_entry "$PROJECT_PATH/.agents"
  remove_opencode_config_entry "$PROJECT_PATH"
  exit 0
fi

echo "Installing skilled into $PROJECT_PATH:"
for dir in "${TARGETS[@]}"; do link_all "$dir"; done
write_skills_json "$PROJECT_PATH/.agents"
write_opencode_config "$PROJECT_PATH"
detect_nested_roots "$PROJECT_PATH"

echo
echo "Each skill is a symlink back into this repo, so 'git pull' here updates"
echo "every project it's installed into. Nothing is copied."
echo
echo "Note: only Claude Code understands 'disable-model-invocation'. On OpenCode"
echo "and Antigravity, every skill is model-selectable regardless of that field,"
echo "since both ignore unrecognized frontmatter keys per the open Agent Skills spec."
