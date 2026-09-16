#!/usr/bin/env bash
# Install skilled into a single project, for the harnesses you actually use
# there. Every location this writes is project-scoped -- nothing here
# touches a global (home-directory) config, on any harness.
#
# Usage:
#   ./install.sh /path/to/project [--claude] [--opencode] [--antigravity] [--vendor]
#   ./install.sh /path/to/project [flags...] [--opencode-delegation] [--agy-delegation] --uninstall
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
#   --opencode     <project>/opencode.json    - Belt and suspenders, not a
#                                                swap: current OpenCode
#                                                (v1.18.30+) also discovers
#                                                project .claude/skills,
#                                                .agents/skills, and
#                                                .opencode/{skill,skills}
#                                                natively, but this
#                                                registration is what still
#                                                matters for an --opencode-only
#                                                symlink install, or a project
#                                                that has disabled native
#                                                discovery. The
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
#   --opencode-delegation  Optional, independent add-on -- not one of the
#                                                three harness flags above,
#                                                and never implied by "no
#                                                harness flag = all three".
#                                                Claude Code only: installs
#                                                the oc* slash commands into
#                                                <project>/.claude/commands,
#                                                plus opencode's own
#                                                project-local agent personas
#                                                into <project>/.opencode/agent,
#                                                and merges a policy fragment
#                                                into <project>/CLAUDE.md
#                                                between
#                                                <!-- skilled:opencode-delegation:start/end -->
#                                                markers (idempotent re-run,
#                                                never duplicated). Off by
#                                                default even after install:
#                                                gated by
#                                                "skilledOpencodeDelegation":
#                                                false written once into
#                                                <project>/.claude/settings.json
#                                                and never overwritten on a
#                                                later install -- flip it to
#                                                true by hand to turn the
#                                                add-on on. Requires the
#                                                opencode CLI plus a working
#                                                model/provider already
#                                                configured on your machine;
#                                                skilled does not install or
#                                                configure opencode itself,
#                                                and ships no API keys or
#                                                provider config. See
#                                                README.md for details.
#   --agy-delegation       Optional, independent add-on, same shape as
#                                                --opencode-delegation above
#                                                but for agy (Google's
#                                                Antigravity CLI): installs
#                                                the agy-research slash
#                                                command into
#                                                <project>/.claude/commands
#                                                and merges a policy fragment
#                                                into <project>/CLAUDE.md
#                                                between
#                                                <!-- skilled:agy-delegation:start/end -->
#                                                markers. No per-role agent
#                                                persona directory is
#                                                installed -- agy-delegation
#                                                calls agy's own default
#                                                agent directly with a
#                                                self-contained brief each
#                                                time. Off by default even
#                                                after install: gated by
#                                                "skilledAgyDelegation":
#                                                false written once into
#                                                <project>/.claude/settings.json,
#                                                never overwritten on a later
#                                                install. Requires the agy
#                                                CLI already installed and
#                                                authenticated on your
#                                                machine; skilled does not
#                                                install or configure agy
#                                                itself. See README.md.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$REPO_DIR/skills"
OD_DIR="$REPO_DIR/opencode-delegation"
OD_COMMANDS_DIR="$OD_DIR/commands"
OD_AGENTS_DIR="$OD_DIR/agents"
OD_START_MARKER="<!-- skilled:opencode-delegation:start -->"
OD_END_MARKER="<!-- skilled:opencode-delegation:end -->"
OD_SETTINGS_KEY="skilledOpencodeDelegation"
AGY_DIR="$REPO_DIR/agy-delegation"
AGY_COMMANDS_DIR="$AGY_DIR/commands"
AGY_START_MARKER="<!-- skilled:agy-delegation:start -->"
AGY_END_MARKER="<!-- skilled:agy-delegation:end -->"
AGY_SETTINGS_KEY="skilledAgyDelegation"
INSTALLER_LIB="$REPO_DIR/installer_lib.py"
MANIFEST_FILE=".skilled-install.json"

# Every write below that isn't a plain symlink goes through the ownership
# manifest (.skilled-install.json in the target project) instead of
# inferring "is this ours" from a filename or frontmatter match -- see
# installer_lib.py. require_python3 is called before any such write.
require_python3() {
  if ! command -v python3 >/dev/null 2>&1; then
    echo "error: python3 not found -- skilled's installer needs it for the ownership manifest and JSON writes" >&2
    exit 1
  fi
}

# Prints one of: absent | owned-current | owned-stale | legacy-symlink | conflict
manifest_check() {
  local rel_path="$1" kind="$2" expected_target="${3:-}"
  python3 "$INSTALLER_LIB" check "$PROJECT_PATH" "$rel_path" "$kind" "$expected_target"
}

manifest_record() {
  local rel_path="$1" kind="$2" source="${3:-}"
  python3 "$INSTALLER_LIB" record "$PROJECT_PATH" "$rel_path" "$kind" "$source"
}

manifest_remove_entry() {
  python3 "$INSTALLER_LIB" remove "$PROJECT_PATH" "$1"
}

manifest_entry_kind() {
  python3 "$INSTALLER_LIB" entry-kind "$PROJECT_PATH" "$1"
}

# rel path of an absolute path under $PROJECT_PATH, for manifest keys.
rel_path() {
  echo "${1#"$PROJECT_PATH"/}"
}

# Validate every config target this run will actually touch BEFORE any
# mutation happens -- malformed JSON, a wrong-typed field, or an unbalanced
# CLAUDE.md marker pair aborts here with a diagnostic and nonzero exit,
# instead of failing partway through after some files were already written.
# Only checks files this run's flags will touch, so an unrelated malformed
# file elsewhere in the project never blocks an unrelated install.
preflight_checks() {
  require_python3
  python3 "$INSTALLER_LIB" validate-json "$PROJECT_PATH/$MANIFEST_FILE"
  python3 "$INSTALLER_LIB" validate-field "$PROJECT_PATH/$MANIFEST_FILE" "entries" dict

  if [ "$DO_ANTIGRAVITY" -eq 1 ]; then
    python3 "$INSTALLER_LIB" validate-json "$PROJECT_PATH/.agents/skills.json"
    python3 "$INSTALLER_LIB" validate-field "$PROJECT_PATH/.agents/skills.json" "entries" list
  fi
  if [ "$DO_OPENCODE" -eq 1 ]; then
    for candidate in "$PROJECT_PATH/opencode.json" "$PROJECT_PATH/.opencode/opencode.json"; do
      python3 "$INSTALLER_LIB" validate-json "$candidate"
      python3 "$INSTALLER_LIB" validate-field "$candidate" "skills" dict
      python3 "$INSTALLER_LIB" validate-field "$candidate" "skills.paths" list
    done
  fi
  if [ "$DO_OD" -eq 1 ]; then
    python3 "$INSTALLER_LIB" validate-json "$PROJECT_PATH/.claude/settings.json"
    python3 "$INSTALLER_LIB" validate-markers "$PROJECT_PATH/CLAUDE.md" "$OD_START_MARKER" "$OD_END_MARKER"
    if ! command -v opencode >/dev/null 2>&1; then
      echo "note: opencode-delegation requested but the 'opencode' CLI isn't on PATH." >&2
      echo "      This add-on installs but does nothing until opencode is installed" >&2
      echo "      and \"$OD_SETTINGS_KEY\": true is set in .claude/settings.json." >&2
    fi
  fi
  if [ "$DO_AGY" -eq 1 ]; then
    python3 "$INSTALLER_LIB" validate-json "$PROJECT_PATH/.claude/settings.json"
    python3 "$INSTALLER_LIB" validate-markers "$PROJECT_PATH/CLAUDE.md" "$AGY_START_MARKER" "$AGY_END_MARKER"
    if ! command -v agy >/dev/null 2>&1; then
      echo "note: agy-delegation requested but the 'agy' CLI isn't on PATH." >&2
      echo "      This add-on installs but does nothing until agy is installed" >&2
      echo "      and \"$AGY_SETTINGS_KEY\": true is set in .claude/settings.json." >&2
    fi
  fi
}

MODE="install"
DO_CLAUDE=0
DO_OPENCODE=0
DO_ANTIGRAVITY=0
DO_OD=0
DO_AGY=0
VENDOR=0
PROJECT_PATH=""

for arg in "$@"; do
  case "$arg" in
    --uninstall) MODE="uninstall" ;;
    --claude) DO_CLAUDE=1 ;;
    --opencode) DO_OPENCODE=1 ;;
    --antigravity) DO_ANTIGRAVITY=1 ;;
    --opencode-delegation) DO_OD=1 ;;
    --agy-delegation) DO_AGY=1 ;;
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
  echo "Usage: $0 /path/to/project [--claude] [--opencode] [--antigravity] [--opencode-delegation] [--agy-delegation] [--vendor] [--uninstall]" >&2
  exit 1
fi

# No harness flag given: default to all three, same as before this flag
# existed -- but not when --opencode-delegation or --agy-delegation was the
# only flag passed. Those flags are independent add-ons, not a fourth/fifth
# harness: someone running `--uninstall --opencode-delegation` almost
# certainly means "just remove this add-on," not "also wipe every skill
# this project has installed."
if [ "$DO_CLAUDE" -eq 0 ] && [ "$DO_OPENCODE" -eq 0 ] && [ "$DO_ANTIGRAVITY" -eq 0 ] && [ "$DO_OD" -eq 0 ] && [ "$DO_AGY" -eq 0 ]; then
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

# Ownership-manifest-aware skill install/removal. Every function below
# consults .skilled-install.json (via installer_lib.py) instead of inferring
# ownership from a filename or SKILL.md frontmatter match -- a same-named
# custom skill a project already has is a conflict to report, never
# something to silently overwrite or delete. See installer_lib.py's
# check_entry() docstring for the exact status meanings.
link_all() {
  local target_dir="$1"
  require_python3
  mkdir -p "$target_dir"
  local linked=0 conflicts=0
  for skill_path in "$SKILLS_DIR"/*/; do
    local name target rel status
    name="$(basename "$skill_path")"
    target="${skill_path%/}"
    rel="$(rel_path "$target_dir")/$name"
    status="$(manifest_check "$rel" "symlink" "$target")"
    case "$status" in
      absent|owned-current|legacy-symlink)
        # rm -rf first: `ln -sfn` alone doesn't safely replace a real
        # directory (e.g. converting a prior --vendor install back to
        # symlink mode) -- it can end up creating the link *inside* it.
        rm -rf "$target_dir/$name"
        ln -sfn "$target" "$target_dir/$name"
        manifest_record "$rel" "symlink" "skill:$name"
        linked=$((linked + 1))
        ;;
      *)
        echo "  warning: $target_dir/$name exists and isn't a skilled-managed install of '$name' -- skipped. Back it up and remove it by hand if you want skilled to manage this name." >&2
        conflicts=$((conflicts + 1))
        ;;
    esac
  done
  echo "  $target_dir  ($linked skills symlinked$([ "$conflicts" -gt 0 ] && echo ", $conflicts conflict(s) skipped"))"
}

# --vendor equivalent of link_all: copies each skill directory instead of
# symlinking it, refusing to overwrite anything the manifest doesn't
# recognize as skilled's own last-installed copy.
copy_all() {
  local target_dir="$1"
  require_python3
  mkdir -p "$target_dir"
  local copied=0 conflicts=0
  for skill_path in "$SKILLS_DIR"/*/; do
    local name target dest rel status
    name="$(basename "$skill_path")"
    target="${skill_path%/}"
    dest="$target_dir/$name"
    rel="$(rel_path "$target_dir")/$name"
    status="$(manifest_check "$rel" "vendor-dir")"
    case "$status" in
      absent|owned-current)
        rm -rf "$dest"
        cp -R "$target" "$dest"
        manifest_record "$rel" "vendor-dir" "skill:$name"
        copied=$((copied + 1))
        ;;
      *)
        echo "  warning: $dest exists and isn't skilled's own unmodified vendored copy of '$name' -- skipped. If this is a stale pre-manifest skilled copy, delete it and re-run install to adopt it; if it's your own, nothing was touched." >&2
        conflicts=$((conflicts + 1))
        ;;
    esac
  done
  echo "  $target_dir  ($copied skills copied$([ "$conflicts" -gt 0 ] && echo ", $conflicts conflict(s) skipped"))"
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
  require_python3
  mkdir -p "$target_dir"
  local linked=0 conflicts=0
  for skill_path in "$SKILLS_DIR"/*/; do
    local name crosslink_target rel status
    name="$(basename "${skill_path%/}")"
    crosslink_target="../../.claude/skills/$name"
    rel="$(rel_path "$target_dir")/$name"
    status="$(manifest_check "$rel" "symlink" "$crosslink_target")"
    case "$status" in
      absent|owned-current|legacy-symlink)
        rm -rf "$target_dir/$name"
        ln -sfn "$crosslink_target" "$target_dir/$name"
        manifest_record "$rel" "symlink" "skill:$name"
        linked=$((linked + 1))
        ;;
      *)
        echo "  warning: $target_dir/$name exists and isn't a skilled-managed install of '$name' -- skipped." >&2
        conflicts=$((conflicts + 1))
        ;;
    esac
  done
  echo "  $target_dir  ($linked skills symlinked from .claude/skills$([ "$conflicts" -gt 0 ] && echo ", $conflicts conflict(s) skipped"))"
}

# Single removal path for every skill-install shape (plain symlink, vendored
# copy, or the vendor cross-link) -- reads the manifest to find out what's
# actually on disk instead of trusting whatever flags this uninstall
# invocation happened to pass. Only removes an entry whose current on-disk
# state still matches exactly what was last recorded (owned-current);
# anything the manifest doesn't recognize, or that changed since install, is
# left in place with a warning rather than guessed at.
remove_managed_skills() {
  local target_dir="$1"
  require_python3
  [ -d "$target_dir" ] || return 0
  local removed=0 kept=0
  for skill_path in "$SKILLS_DIR"/*/; do
    local name dest rel kind status
    name="$(basename "${skill_path%/}")"
    dest="$target_dir/$name"
    [ -e "$dest" ] || [ -L "$dest" ] || continue
    rel="$(rel_path "$target_dir")/$name"
    kind="$(manifest_entry_kind "$rel")"
    if [ -z "$kind" ]; then
      continue # never installed by skilled -- never touch it
    fi
    status="$(manifest_check "$rel" "$kind")"
    if [ "$status" = "owned-current" ]; then
      if [ "$kind" = "symlink" ]; then rm "$dest"; else rm -rf "$dest"; fi
      manifest_remove_entry "$rel"
      removed=$((removed + 1))
    else
      echo "  warning: $dest changed since skilled installed it -- left in place. Remove it by hand if you want it gone." >&2
      kept=$((kept + 1))
    fi
  done
  echo "  $target_dir  (removed $removed$([ "$kept" -gt 0 ] && echo ", $kept left in place"))"
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

tmp = f"{json_file}.tmp.{os.getpid()}"
with open(tmp, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
    f.flush()
    os.fsync(f.fileno())
os.replace(tmp, json_file)
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

def atomic_write(path, data):
    tmp = f"{path}.tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

if entries:
    data["entries"] = entries
    atomic_write(json_file, data)
elif data.get("inherits") or (set(data.keys()) - {"entries"}):
    data.pop("entries", None)
    atomic_write(json_file, data)
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

tmp = f"{json_file}.tmp.{os.getpid()}"
with open(tmp, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
    f.flush()
    os.fsync(f.fileno())
os.replace(tmp, json_file)
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
    tmp = f"{json_file}.tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, json_file)
else:
    os.remove(json_file)
PYEOF
  echo "  $target  (unregistered)"
}

# opencode-delegation add-on helpers. Independent of the skill-distribution
# functions above -- these install Claude Code slash commands and opencode's
# own project-local agent personas, not Agent Skills, so they never touch
# .agents/skills or opencode.json's "skills" key. Manifest-aware like the
# skill installers above: never overwrites or deletes a file a project owner
# put there themselves under the same name.
link_od_dir() {
  local src_dir="$1" target_dir="$2" label="$3"
  require_python3
  mkdir -p "$target_dir"
  local linked=0 conflicts=0
  for f in "$src_dir"/*.md; do
    local base rel status
    base="$(basename "$f")"
    rel="$(rel_path "$target_dir")/$base"
    status="$(manifest_check "$rel" "symlink" "$f")"
    case "$status" in
      absent|owned-current|legacy-symlink)
        rm -rf "$target_dir/$base"
        ln -sfn "$f" "$target_dir/$base"
        manifest_record "$rel" "symlink" "opencode-delegation:$base"
        linked=$((linked + 1))
        ;;
      *)
        echo "  warning: $target_dir/$base already exists and isn't skilled's own install -- skipped." >&2
        conflicts=$((conflicts + 1))
        ;;
    esac
  done
  echo "  $target_dir  ($linked $label symlinked$([ "$conflicts" -gt 0 ] && echo ", $conflicts conflict(s) skipped"))"
}

copy_od_dir() {
  local src_dir="$1" target_dir="$2" label="$3"
  require_python3
  mkdir -p "$target_dir"
  local copied=0 conflicts=0
  for f in "$src_dir"/*.md; do
    local base dest rel status
    base="$(basename "$f")"
    dest="$target_dir/$base"
    rel="$(rel_path "$target_dir")/$base"
    status="$(manifest_check "$rel" "vendor-file")"
    case "$status" in
      absent|owned-current)
        # rm -rf first: plain `cp` onto an existing symlink writes *through*
        # it into whatever it points at -- if a prior symlink-mode install
        # is being converted to --vendor, that target is this repo's own
        # source file. Removing the dest first makes cp create a fresh
        # regular file instead of following a stale link.
        rm -rf "$dest"
        cp "$f" "$dest"
        manifest_record "$rel" "vendor-file" "opencode-delegation:$base"
        copied=$((copied + 1))
        ;;
      *)
        echo "  warning: $dest already exists and isn't skilled's own unmodified copy -- skipped." >&2
        conflicts=$((conflicts + 1))
        ;;
    esac
  done
  echo "  $target_dir  ($copied $label copied$([ "$conflicts" -gt 0 ] && echo ", $conflicts conflict(s) skipped"))"
}

# Removes only what the manifest says skilled installed here, and only if
# it's still exactly what was last installed -- never a dest file matching a
# source filename by coincidence, and never a copy the project owner has
# since edited.
remove_od_dir() {
  local src_dir="$1" target_dir="$2" label="$3"
  require_python3
  [ -d "$target_dir" ] || return 0
  local removed=0 kept=0
  for f in "$src_dir"/*.md; do
    local base dest rel kind status
    base="$(basename "$f")"
    dest="$target_dir/$base"
    [ -e "$dest" ] || [ -L "$dest" ] || continue
    rel="$(rel_path "$target_dir")/$base"
    kind="$(manifest_entry_kind "$rel")"
    if [ -z "$kind" ]; then
      continue
    fi
    status="$(manifest_check "$rel" "$kind")"
    if [ "$status" = "owned-current" ]; then
      rm -f "$dest"
      manifest_remove_entry "$rel"
      removed=$((removed + 1))
    else
      echo "  warning: $dest changed since skilled installed it -- left in place." >&2
      kept=$((kept + 1))
    fi
  done
  echo "  $target_dir  (removed $removed $label$([ "$kept" -gt 0 ] && echo ", $kept left in place"))"
}

# Merges opencode-delegation/CLAUDE.fragment.md into <project>/CLAUDE.md.
# The fragment file's own first/last lines ARE the start/end markers, so
# "insert the fragment" and "insert the marked block" are the same
# operation. No CLAUDE.md yet: the fragment becomes the whole file. Markers
# already present: replace everything between them (idempotent re-run, never
# duplicated). No markers yet but file exists: append.
merge_claude_md() {
  local project="$1"
  local claude_md="$project/CLAUDE.md"
  local fragment="$OD_DIR/CLAUDE.fragment.md"
  if [ ! -f "$claude_md" ]; then
    cp "$fragment" "$claude_md"
    echo "  $claude_md  (created)"
    return 0
  fi
  if grep -qF "$OD_START_MARKER" "$claude_md"; then
    awk -v start="$OD_START_MARKER" -v end="$OD_END_MARKER" -v fragfile="$fragment" '
      $0 == start {
        while ((getline line < fragfile) > 0) print line
        close(fragfile)
        skip = 1
        next
      }
      $0 == end { skip = 0; next }
      skip { next }
      { print }
    ' "$claude_md" > "$claude_md.tmp" && mv "$claude_md.tmp" "$claude_md"
    echo "  $claude_md  (updated existing opencode-delegation block)"
  else
    { echo; cat "$fragment"; } >> "$claude_md"
    echo "  $claude_md  (appended)"
  fi
}

# Uninstall counterpart: strips the marked block, leaving the rest of the
# project's CLAUDE.md untouched. Leaves an empty file rather than deleting it
# if the block was the file's only content.
strip_claude_md_block() {
  local project="$1"
  local claude_md="$project/CLAUDE.md"
  [ -f "$claude_md" ] || return 0
  grep -qF "$OD_START_MARKER" "$claude_md" || return 0
  awk -v start="$OD_START_MARKER" -v end="$OD_END_MARKER" '
    $0 == start { skip = 1; next }
    $0 == end { skip = 0; next }
    skip { next }
    { print }
  ' "$claude_md" > "$claude_md.tmp" && mv "$claude_md.tmp" "$claude_md"
  echo "  $claude_md  (removed opencode-delegation block)"
}

# Writes "skilledOpencodeDelegation": false into <project>/.claude/settings.json
# the first time this add-on is installed -- the on/off switch a human flips
# by hand afterward. Never overwrites an existing value, so re-running
# install (or --vendor resync) never resets someone's toggle back to off.
ensure_od_settings_toggle() {
  local project="$1"
  local settings_dir="$project/.claude"
  local settings_file="$settings_dir/settings.json"
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  warning: python3 not found, skipped $settings_file (add \"$OD_SETTINGS_KEY\": false by hand, then flip it to true to enable this add-on)" >&2
    return 0
  fi
  mkdir -p "$settings_dir"
  python3 - "$settings_file" "$OD_SETTINGS_KEY" <<'PYEOF'
import json, os, sys

json_file, key = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(json_file):
    content = open(json_file).read().strip()
    if content:
        data = json.loads(content)

if key not in data:
    data[key] = False
    tmp = f"{json_file}.tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, json_file)
PYEOF
  echo "  $settings_file  (ensured \"$OD_SETTINGS_KEY\": false if not already set)"
}

remove_od_settings_toggle() {
  local project="$1"
  local settings_file="$project/.claude/settings.json"
  [ -f "$settings_file" ] || return 0
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  warning: python3 not found, left $settings_file untouched" >&2
    return 0
  fi
  python3 - "$settings_file" "$OD_SETTINGS_KEY" <<'PYEOF'
import json, os, sys

json_file, key = sys.argv[1], sys.argv[2]
content = open(json_file).read().strip()
if not content:
    sys.exit(0)
data = json.loads(content)
if key in data:
    del data[key]
    tmp = f"{json_file}.tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, json_file)
PYEOF
  echo "  $settings_file  (removed \"$OD_SETTINGS_KEY\" key if present)"
}

# agy-delegation add-on helpers. Same shape as the opencode-delegation
# helpers above, minus an agents dir: agy-delegation has no per-role
# persona file to install -- delegation calls invoke agy's own default
# agent directly with a self-contained brief each time, the same way
# `opencode run --agent orchestrator "Delegate to..."` doesn't need a
# project-local orchestrator.md to work.
link_agy_dir() {
  local src_dir="$1" target_dir="$2" label="$3"
  require_python3
  mkdir -p "$target_dir"
  local linked=0 conflicts=0
  for f in "$src_dir"/*.md; do
    local base rel status
    base="$(basename "$f")"
    rel="$(rel_path "$target_dir")/$base"
    status="$(manifest_check "$rel" "symlink" "$f")"
    case "$status" in
      absent|owned-current|legacy-symlink)
        rm -rf "$target_dir/$base"
        ln -sfn "$f" "$target_dir/$base"
        manifest_record "$rel" "symlink" "agy-delegation:$base"
        linked=$((linked + 1))
        ;;
      *)
        echo "  warning: $target_dir/$base already exists and isn't skilled's own install -- skipped." >&2
        conflicts=$((conflicts + 1))
        ;;
    esac
  done
  echo "  $target_dir  ($linked $label symlinked$([ "$conflicts" -gt 0 ] && echo ", $conflicts conflict(s) skipped"))"
}

copy_agy_dir() {
  local src_dir="$1" target_dir="$2" label="$3"
  require_python3
  mkdir -p "$target_dir"
  local copied=0 conflicts=0
  for f in "$src_dir"/*.md; do
    local base dest rel status
    base="$(basename "$f")"
    dest="$target_dir/$base"
    rel="$(rel_path "$target_dir")/$base"
    status="$(manifest_check "$rel" "vendor-file")"
    case "$status" in
      absent|owned-current)
        rm -rf "$dest"
        cp "$f" "$dest"
        manifest_record "$rel" "vendor-file" "agy-delegation:$base"
        copied=$((copied + 1))
        ;;
      *)
        echo "  warning: $dest already exists and isn't skilled's own unmodified copy -- skipped." >&2
        conflicts=$((conflicts + 1))
        ;;
    esac
  done
  echo "  $target_dir  ($copied $label copied$([ "$conflicts" -gt 0 ] && echo ", $conflicts conflict(s) skipped"))"
}

remove_agy_dir() {
  local src_dir="$1" target_dir="$2" label="$3"
  require_python3
  [ -d "$target_dir" ] || return 0
  local removed=0 kept=0
  for f in "$src_dir"/*.md; do
    local base dest rel kind status
    base="$(basename "$f")"
    dest="$target_dir/$base"
    [ -e "$dest" ] || [ -L "$dest" ] || continue
    rel="$(rel_path "$target_dir")/$base"
    kind="$(manifest_entry_kind "$rel")"
    if [ -z "$kind" ]; then
      continue
    fi
    status="$(manifest_check "$rel" "$kind")"
    if [ "$status" = "owned-current" ]; then
      rm -f "$dest"
      manifest_remove_entry "$rel"
      removed=$((removed + 1))
    else
      echo "  warning: $dest changed since skilled installed it -- left in place." >&2
      kept=$((kept + 1))
    fi
  done
  echo "  $target_dir  (removed $removed $label$([ "$kept" -gt 0 ] && echo ", $kept left in place"))"
}

# Merges agy-delegation/CLAUDE.fragment.md into <project>/CLAUDE.md, using
# its own distinct markers so it coexists independently of an
# opencode-delegation block in the same file. Same idempotent
# create/replace/append logic as merge_claude_md.
merge_agy_claude_md() {
  local project="$1"
  local claude_md="$project/CLAUDE.md"
  local fragment="$AGY_DIR/CLAUDE.fragment.md"
  if [ ! -f "$claude_md" ]; then
    cp "$fragment" "$claude_md"
    echo "  $claude_md  (created)"
    return 0
  fi
  if grep -qF "$AGY_START_MARKER" "$claude_md"; then
    awk -v start="$AGY_START_MARKER" -v end="$AGY_END_MARKER" -v fragfile="$fragment" '
      $0 == start {
        while ((getline line < fragfile) > 0) print line
        close(fragfile)
        skip = 1
        next
      }
      $0 == end { skip = 0; next }
      skip { next }
      { print }
    ' "$claude_md" > "$claude_md.tmp" && mv "$claude_md.tmp" "$claude_md"
    echo "  $claude_md  (updated existing agy-delegation block)"
  else
    { echo; cat "$fragment"; } >> "$claude_md"
    echo "  $claude_md  (appended)"
  fi
}

strip_agy_claude_md_block() {
  local project="$1"
  local claude_md="$project/CLAUDE.md"
  [ -f "$claude_md" ] || return 0
  grep -qF "$AGY_START_MARKER" "$claude_md" || return 0
  awk -v start="$AGY_START_MARKER" -v end="$AGY_END_MARKER" '
    $0 == start { skip = 1; next }
    $0 == end { skip = 0; next }
    skip { next }
    { print }
  ' "$claude_md" > "$claude_md.tmp" && mv "$claude_md.tmp" "$claude_md"
  echo "  $claude_md  (removed agy-delegation block)"
}

ensure_agy_settings_toggle() {
  local project="$1"
  local settings_dir="$project/.claude"
  local settings_file="$settings_dir/settings.json"
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  warning: python3 not found, skipped $settings_file (add \"$AGY_SETTINGS_KEY\": false by hand, then flip it to true to enable this add-on)" >&2
    return 0
  fi
  mkdir -p "$settings_dir"
  python3 - "$settings_file" "$AGY_SETTINGS_KEY" <<'PYEOF'
import json, os, sys

json_file, key = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(json_file):
    content = open(json_file).read().strip()
    if content:
        data = json.loads(content)

if key not in data:
    data[key] = False
    tmp = f"{json_file}.tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, json_file)
PYEOF
  echo "  $settings_file  (ensured \"$AGY_SETTINGS_KEY\": false if not already set)"
}

remove_agy_settings_toggle() {
  local project="$1"
  local settings_file="$project/.claude/settings.json"
  [ -f "$settings_file" ] || return 0
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  warning: python3 not found, left $settings_file untouched" >&2
    return 0
  fi
  python3 - "$settings_file" "$AGY_SETTINGS_KEY" <<'PYEOF'
import json, os, sys

json_file, key = sys.argv[1], sys.argv[2]
content = open(json_file).read().strip()
if not content:
    sys.exit(0)
data = json.loads(content)
if key in data:
    del data[key]
    tmp = f"{json_file}.tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, json_file)
PYEOF
  echo "  $settings_file  (removed \"$AGY_SETTINGS_KEY\" key if present)"
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

preflight_checks

if [ "$MODE" = "uninstall" ]; then
  echo "Removing skilled from $PROJECT_PATH:"
  # remove_managed_skills reads .skilled-install.json to find out what's
  # actually on disk (symlink, vendored copy, or vendor cross-link) instead
  # of trusting this invocation's --vendor flag -- so a bare `--uninstall`
  # after a `--vendor` install still finds and removes everything.
  [ "$DO_CLAUDE" -eq 1 ] && remove_managed_skills "$PROJECT_PATH/.claude/skills"
  if [ "$DO_ANTIGRAVITY" -eq 1 ]; then
    remove_managed_skills "$PROJECT_PATH/.agents/skills"
    remove_skills_json_entry "$PROJECT_PATH/.agents" "${KNOWN_PATHS[@]}"
  fi
  [ "$DO_OPENCODE" -eq 1 ] && remove_opencode_config_entry "$PROJECT_PATH" "${KNOWN_PATHS[@]}"
  if [ "$DO_OD" -eq 1 ]; then
    remove_od_dir "$OD_COMMANDS_DIR" "$PROJECT_PATH/.claude/commands" "opencode-delegation commands"
    remove_od_dir "$OD_AGENTS_DIR" "$PROJECT_PATH/.opencode/agent" "opencode-delegation agents"
    strip_claude_md_block "$PROJECT_PATH"
    remove_od_settings_toggle "$PROJECT_PATH"
  fi
  if [ "$DO_AGY" -eq 1 ]; then
    remove_agy_dir "$AGY_COMMANDS_DIR" "$PROJECT_PATH/.claude/commands" "agy-delegation commands"
    strip_agy_claude_md_block "$PROJECT_PATH"
    remove_agy_settings_toggle "$PROJECT_PATH"
  fi
  # Tidy up an empty manifest -- harmless to leave, but a project with
  # nothing left installed shouldn't keep a stub metadata file around.
  if [ -f "$PROJECT_PATH/$MANIFEST_FILE" ] && [ "$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1])).get('entries', {})))" "$PROJECT_PATH/$MANIFEST_FILE" 2>/dev/null)" = "0" ]; then
    rm -f "$PROJECT_PATH/$MANIFEST_FILE"
  fi
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
if [ "$DO_OD" -eq 1 ]; then
  if [ "$VENDOR" -eq 1 ]; then
    copy_od_dir "$OD_COMMANDS_DIR" "$PROJECT_PATH/.claude/commands" "opencode-delegation commands"
    copy_od_dir "$OD_AGENTS_DIR" "$PROJECT_PATH/.opencode/agent" "opencode-delegation agents"
  else
    link_od_dir "$OD_COMMANDS_DIR" "$PROJECT_PATH/.claude/commands" "opencode-delegation commands"
    link_od_dir "$OD_AGENTS_DIR" "$PROJECT_PATH/.opencode/agent" "opencode-delegation agents"
  fi
  merge_claude_md "$PROJECT_PATH"
  ensure_od_settings_toggle "$PROJECT_PATH"
fi
if [ "$DO_AGY" -eq 1 ]; then
  if [ "$VENDOR" -eq 1 ]; then
    copy_agy_dir "$AGY_COMMANDS_DIR" "$PROJECT_PATH/.claude/commands" "agy-delegation commands"
  else
    link_agy_dir "$AGY_COMMANDS_DIR" "$PROJECT_PATH/.claude/commands" "agy-delegation commands"
  fi
  merge_agy_claude_md "$PROJECT_PATH"
  ensure_agy_settings_toggle "$PROJECT_PATH"
fi
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
if [ "$DO_OD" -eq 1 ]; then
  echo
  echo "opencode-delegation installed but off: \"$OD_SETTINGS_KEY\": false in"
  echo ".claude/settings.json. Flip it to true to enable it, and make sure the"
  echo "opencode CLI plus a working model/provider are already set up -- skilled"
  echo "does not install or configure opencode itself. See README.md."
  if ! command -v opencode >/dev/null 2>&1; then
    echo "warning: 'opencode' was not found on PATH just now -- install it before"
    echo "flipping the flag on, or this add-on has nothing to call."
  fi
fi
if [ "$DO_AGY" -eq 1 ]; then
  echo
  echo "agy-delegation installed but off: \"$AGY_SETTINGS_KEY\": false in"
  echo ".claude/settings.json. Flip it to true to enable it, and make sure the"
  echo "agy CLI (Google's Antigravity CLI) is already installed and authenticated"
  echo "-- skilled does not install or configure agy itself. See README.md."
  if ! command -v agy >/dev/null 2>&1; then
    echo "warning: 'agy' was not found on PATH just now -- install it before"
    echo "flipping the flag on, or this add-on has nothing to call."
  fi
fi
