#!/usr/bin/env bash
# Install skilled into a single project, for the harnesses you actually use
# there. Every location this writes is project-scoped -- nothing here
# touches a global (home-directory) config, on any harness.
#
# Usage:
#   ./install.sh /path/to/project [--claude] [--opencode] [--antigravity] [--vendor]
#   ./install.sh /path/to/project [flags...] --uninstall
#
# No harness flag = all three (unchanged default). Pass one or more to
# install only those -- e.g. `--claude` alone if a project never runs
# OpenCode or Antigravity.
#
# Two distribution modes:
#
#   Symlink (default). Each skill is a symlink back into THIS repo, at its
#   absolute path on THIS machine. `git pull` here updates every project
#   it's installed into instantly -- but it only works on the machine that
#   ran the install: a coworker cloning the project gets a dead symlink and
#   a JSON path pointing at a directory that doesn't exist on their disk.
#   Right model for a solo dev's own machine across several personal repos.
#
#   --vendor. Copies real files into the project instead of symlinking, and
#   uses paths relative to the project instead of this repo's absolute
#   path. Self-contained and git-add-able: a coworker who clones the project
#   gets working skills with no separate checkout of this repo. The
#   trade-off is the one every vendored dependency has -- it goes stale.
#   Re-run `--vendor` after this repo updates to resync; nothing here
#   detects staleness or updates itself automatically.
#
# What each flag writes, and why:
#   --claude       <project>/.claude/skills   - Claude Code's native project
#                                                scope.
#   --antigravity  <project>/.agents/skills   - Antigravity's native project
#                                                scope, PLUS
#                                                <project>/.agents/skills.json
#                                                -- Antigravity's own logs
#                                                show the native scan can go
#                                                stale on a symlinked folder
#                                                ("Slash commands unchanged,
#                                                skipping update" even after a
#                                                real change), and its own
#                                                docs recommend this file for
#                                                skills outside its default
#                                                discovery locations. Belt and
#                                                suspenders, not a swap --
#                                                written even in --vendor
#                                                mode, just with a
#                                                project-relative path.
#   --opencode     <project>/opencode.json    - Required, not optional: its
#                                                own embedded docs say
#                                                external-skill auto-load only
#                                                scans ~/.claude/ and
#                                                ~/.agents/ (global), never a
#                                                project's .claude/skills or
#                                                .agents/skills. The
#                                                "skills": {"paths": [...]}
#                                                entry this writes is
#                                                OpenCode's own project-scoped
#                                                mechanism. In --vendor mode
#                                                this points at whichever
#                                                directory actually got
#                                                vendored (.claude/skills if
#                                                --claude ran, else
#                                                .agents/skills, else
#                                                .claude/skills is vendored
#                                                anyway just to give OpenCode
#                                                something to point at).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$REPO_DIR/skills"

MODE="install"
DO_CLAUDE=0
DO_OPENCODE=0
DO_ANTIGRAVITY=0
VENDOR=0
PROJECT_PATH=""

for arg in "$@"; do
  case "$arg" in
    --uninstall) MODE="uninstall" ;;
    --claude) DO_CLAUDE=1 ;;
    --opencode) DO_OPENCODE=1 ;;
    --antigravity) DO_ANTIGRAVITY=1 ;;
    --vendor) VENDOR=1 ;;
    --*) echo "error: unknown flag $arg" >&2; exit 1 ;;
    *)
      if [ -n "$PROJECT_PATH" ]; then
        echo "error: unexpected extra argument $arg" >&2
        exit 1
      fi
      PROJECT_PATH="$arg"
      ;;
  esac
done

if [ -z "$PROJECT_PATH" ]; then
  echo "Usage: $0 /path/to/project [--claude] [--opencode] [--antigravity] [--vendor] [--uninstall]" >&2
  exit 1
fi

# No harness flag given: default to all three, same as before this flag existed.
if [ "$DO_CLAUDE" -eq 0 ] && [ "$DO_OPENCODE" -eq 0 ] && [ "$DO_ANTIGRAVITY" -eq 0 ]; then
  DO_CLAUDE=1
  DO_OPENCODE=1
  DO_ANTIGRAVITY=1
fi

if [ ! -d "$PROJECT_PATH" ]; then
  echo "error: $PROJECT_PATH is not a directory" >&2
  exit 1
fi
PROJECT_PATH="$(cd "$PROJECT_PATH" && pwd)"

# In --vendor mode, OpenCode needs an actual directory of copied skills to
# point at even if neither --claude nor --antigravity was requested.
if [ "$VENDOR" -eq 1 ] && [ "$DO_OPENCODE" -eq 1 ] && [ "$DO_CLAUDE" -eq 0 ] && [ "$DO_ANTIGRAVITY" -eq 0 ]; then
  DO_CLAUDE=1
  echo "note: --vendor --opencode alone needs a vendored copy to point at; vendoring into .claude/skills too."
fi

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
  echo "  $target_dir  ($linked skills, symlinked)"
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

# --vendor equivalent of link_all: copies each skill directory in place of
# symlinking it. Only touches subdirectories whose name matches a skill in
# this repo, and only overwrites ones that already look like a vendored
# copy of that skill (a real directory, not a symlink, with a SKILL.md
# whose name: frontmatter matches) -- so it never clobbers something a
# project put there itself under a colliding name.
copy_all() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  local copied=0 skipped=0
  for skill_path in "$SKILLS_DIR"/*/; do
    local name target dest
    name="$(basename "$skill_path")"
    target="${skill_path%/}"
    dest="$target_dir/$name"
    if [ -e "$dest" ] && { [ -L "$dest" ] || ! grep -q "^name: $name$" "$dest/SKILL.md" 2>/dev/null; }; then
      skipped=$((skipped + 1))
      continue
    fi
    rm -rf "$dest"
    cp -R "$target" "$dest"
    copied=$((copied + 1))
  done
  if [ "$skipped" -gt 0 ]; then
    echo "  $target_dir  ($copied skills copied, $skipped skipped -- not a vendored copy of that skill)"
  else
    echo "  $target_dir  ($copied skills copied)"
  fi
}

remove_vendored() {
  local target_dir="$1"
  [ -d "$target_dir" ] || return 0
  local removed=0
  for skill_path in "$SKILLS_DIR"/*/; do
    local name dest
    name="$(basename "$skill_path")"
    dest="$target_dir/$name"
    if [ -d "$dest" ] && [ ! -L "$dest" ] && grep -q "^name: $name$" "$dest/SKILL.md" 2>/dev/null; then
      rm -rf "$dest"
      removed=$((removed + 1))
    fi
  done
  echo "  $target_dir  (removed $removed)"
}

# --vendor, when both --claude and --antigravity are requested: .claude/skills
# already has a real, vendored copy of every skill, so .agents/skills doesn't
# need a second one -- it gets a relative in-project symlink back to
# .claude/skills/<name> instead. Halves the vendored footprint (37 files
# copied once, not twice) while still giving Antigravity's native
# .agents/skills/ scan real entries to find. Only used when both harnesses
# are requested; --antigravity alone in --vendor mode has nothing to link
# from, so it still gets copy_all's real copies.
link_from_claude() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  local linked=0
  for skill_path in "$SKILLS_DIR"/*/; do
    local name
    name="$(basename "${skill_path%/}")"
    ln -sfn "../../.claude/skills/$name" "$target_dir/$name"
    linked=$((linked + 1))
  done
  echo "  $target_dir  ($linked skills, symlinked from .claude/skills)"
}

# Uninstall counterpart to link_from_claude: an .agents/skills entry in
# --vendor mode is either a cross-link to .claude/skills (remove as a
# symlink) or a standalone vendored copy (remove as a directory, same rule
# as remove_vendored) -- checked per-entry since which one applies can
# depend on flags a previous install used that this uninstall doesn't repeat.
remove_agents_vendor() {
  local target_dir="$1"
  [ -d "$target_dir" ] || return 0
  local removed=0
  for skill_path in "$SKILLS_DIR"/*/; do
    local name dest
    name="$(basename "${skill_path%/}")"
    dest="$target_dir/$name"
    if [ -L "$dest" ]; then
      case "$(readlink "$dest")" in
        *".claude/skills/$name") rm "$dest"; removed=$((removed + 1)) ;;
      esac
    elif [ -d "$dest" ] && grep -q "^name: $name$" "$dest/SKILL.md" 2>/dev/null; then
      rm -rf "$dest"
      removed=$((removed + 1))
    fi
  done
  echo "  $target_dir  (removed $removed)"
}

# Antigravity-specific: register a path in <project>/.agents/skills.json via
# its documented { "entries": [{ "path": ... }] } schema. $2 is what to
# register -- $SKILLS_DIR (absolute, symlink mode) or a project-relative
# path (--vendor mode, e.g. ".agents/skills"; Antigravity's own docs say a
# path not starting with / or ~/ resolves from the repo root). Merges into
# an existing file rather than overwriting it, so a project's own entries
# (or ones from other tools) survive.
write_skills_json() {
  local agents_dir="$1"
  local register_path="$2"
  local json_file="$agents_dir/skills.json"
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  warning: python3 not found, skipped $json_file (Antigravity needs it to see these skills)" >&2
    return 0
  fi
  mkdir -p "$agents_dir"
  python3 - "$json_file" "$register_path" <<'PYEOF'
import json, os, sys

json_file, register_path = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(json_file):
    content = open(json_file).read().strip()
    if content:
        data = json.loads(content)

entries = data.setdefault("entries", [])
if not any(e.get("path") == register_path for e in entries):
    entries.append({"path": register_path})

with open(json_file, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF
  echo "  $json_file  (registered $register_path)"
}

# Removes any entry matching one of the given candidate paths, not just one
# computed from this uninstall's flags: an uninstall doesn't necessarily
# repeat the exact flags the matching install used (e.g. `--vendor
# --antigravity` alone, uninstalling from a project that was originally
# `--vendor` with no flags = all three), so the registered path could be any
# of the values this script has ever written. Only ever removes entries
# matching one of those known values -- never touches an entry from
# something else.
remove_skills_json_entry() {
  local agents_dir="$1"
  shift
  local json_file="$agents_dir/skills.json"
  [ -f "$json_file" ] || return 0
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  warning: python3 not found, left $json_file untouched" >&2
    return 0
  fi
  python3 - "$json_file" "$@" <<'PYEOF'
import json, os, sys

json_file, candidates = sys.argv[1], set(sys.argv[2:])
content = open(json_file).read().strip()
data = json.loads(content) if content else {}
entries = [e for e in data.get("entries", []) if e.get("path") not in candidates]

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
  echo "  $json_file  (unregistered)"
}

# OpenCode-specific: register a path under "skills": {"paths": [...]} in the
# project's opencode.json. $2 is what to register -- see write_skills_json
# above for the absolute-vs-relative rule. OpenCode checks ./opencode.json,
# ./opencode.jsonc, then .opencode/opencode.json, in that order; this edits
# whichever already exists, or creates ./opencode.json if none do. A
# pre-existing .jsonc is never auto-edited (comments don't survive a JSON
# round-trip) -- printed as a manual instruction instead.
write_opencode_config() {
  local project="$1"
  local register_path="$2"
  local target=""
  if [ -f "$project/opencode.json" ]; then
    target="$project/opencode.json"
  elif [ -f "$project/opencode.jsonc" ]; then
    echo "  $project/opencode.jsonc exists; skilled won't auto-edit JSONC (comments don't survive a rewrite)." >&2
    echo "    Add by hand: {\"skills\": {\"paths\": [\"$register_path\"]}}" >&2
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

  python3 - "$target" "$register_path" <<'PYEOF'
import json, os, sys

json_file, register_path = sys.argv[1], sys.argv[2]
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
if register_path not in paths:
    paths.append(register_path)

with open(json_file, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF
  echo "  $target  (registered $register_path)"
}

# Same "remove any known candidate, not just one computed from current
# flags" reasoning as remove_skills_json_entry above.
remove_opencode_config_entry() {
  local project="$1"
  shift
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

  python3 - "$target" "$@" <<'PYEOF'
import json, os, sys

json_file, candidates = sys.argv[1], set(sys.argv[2:])
content = open(json_file).read().strip()
data = json.loads(content) if content else {}
skills = data.get("skills", {})
paths = [p for p in skills.get("paths", []) if p not in candidates]

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
  echo "  $target  (unregistered)"
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
  local vendor_flag=""
  [ "$VENDOR" -eq 1 ] && vendor_flag=" --vendor"
  for f in "${unique[@]}"; do
    echo "  ./install.sh $f$vendor_flag"
  done
}

# Path to register in .agents/skills.json / opencode.json: this repo's
# absolute path in symlink mode, or a project-relative path in --vendor
# mode (Antigravity resolves a path with no leading / or ~/ from the repo
# root; OpenCode's own example config does the same for its native
# .opencode/skills entry). In --vendor mode both point at .claude/skills
# when it exists -- real files, guaranteed to work regardless of whether a
# scanner follows symlinked subdirectories -- falling back to .agents/skills
# only when --claude wasn't requested at all.
if [ "$VENDOR" -eq 1 ]; then
  if [ "$DO_CLAUDE" -eq 1 ]; then
    ANTIGRAVITY_PATH=".claude/skills"
    OPENCODE_PATH=".claude/skills"
  else
    ANTIGRAVITY_PATH=".agents/skills"
    OPENCODE_PATH=".agents/skills"
  fi
else
  ANTIGRAVITY_PATH="$SKILLS_DIR"
  OPENCODE_PATH="$SKILLS_DIR"
fi

# Every value this script has ever registered, across both modes and both
# harness combinations -- used on --uninstall so it removes a stale entry
# even when this uninstall's flags don't exactly match whatever flags the
# original install used.
KNOWN_PATHS=("$SKILLS_DIR" ".claude/skills" ".agents/skills")

if [ "$MODE" = "uninstall" ]; then
  echo "Removing skilled from $PROJECT_PATH:"
  if [ "$DO_CLAUDE" -eq 1 ]; then
    if [ "$VENDOR" -eq 1 ]; then remove_vendored "$PROJECT_PATH/.claude/skills"; else unlink_all "$PROJECT_PATH/.claude/skills"; fi
  fi
  if [ "$DO_ANTIGRAVITY" -eq 1 ]; then
    if [ "$VENDOR" -eq 1 ]; then remove_agents_vendor "$PROJECT_PATH/.agents/skills"; else unlink_all "$PROJECT_PATH/.agents/skills"; fi
    remove_skills_json_entry "$PROJECT_PATH/.agents" "${KNOWN_PATHS[@]}"
  fi
  [ "$DO_OPENCODE" -eq 1 ] && remove_opencode_config_entry "$PROJECT_PATH" "${KNOWN_PATHS[@]}"
  exit 0
fi

echo "Installing skilled into $PROJECT_PATH:"
if [ "$DO_CLAUDE" -eq 1 ]; then
  if [ "$VENDOR" -eq 1 ]; then copy_all "$PROJECT_PATH/.claude/skills"; else link_all "$PROJECT_PATH/.claude/skills"; fi
fi
if [ "$DO_ANTIGRAVITY" -eq 1 ]; then
  if [ "$VENDOR" -eq 1 ]; then
    if [ "$DO_CLAUDE" -eq 1 ]; then link_from_claude "$PROJECT_PATH/.agents/skills"; else copy_all "$PROJECT_PATH/.agents/skills"; fi
  else
    link_all "$PROJECT_PATH/.agents/skills"
  fi
  write_skills_json "$PROJECT_PATH/.agents" "$ANTIGRAVITY_PATH"
fi
[ "$DO_OPENCODE" -eq 1 ] && write_opencode_config "$PROJECT_PATH" "$OPENCODE_PATH"
detect_nested_roots "$PROJECT_PATH"

echo
if [ "$VENDOR" -eq 1 ]; then
  echo "Vendored: real copies, not symlinks. git add-able, works for anyone who"
  echo "clones this project without a separate checkout of skilled. Re-run"
  echo "'--vendor' after skilled updates upstream to resync -- nothing here"
  echo "detects staleness automatically."
else
  echo "Each skill is a symlink back into this repo, so 'git pull' here updates"
  echo "every project it's installed into. Nothing is copied. This only works on"
  echo "this machine -- see the header comment for '--vendor' if this project is"
  echo "shared with others."
fi
echo
echo "Note: only Claude Code understands 'disable-model-invocation'. On OpenCode"
echo "and Antigravity, every skill is model-selectable regardless of that field,"
echo "since both ignore unrecognized frontmatter keys per the open Agent Skills spec."
