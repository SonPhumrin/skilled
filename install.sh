#!/usr/bin/env bash
# Install skilled into a single project, for every harness that reads the
# Agent Skills format there: Claude Code, OpenCode, and Antigravity.
#
# Usage:
#   ./install.sh /path/to/project              install into that project
#   ./install.sh /path/to/project --uninstall  remove the symlinks this created
#
# Per-project paths, and why both are written:
#   <project>/.claude/skills   - Claude Code (native); OpenCode also reads this
#   <project>/.agents/skills   - Antigravity's project scope; OpenCode reads
#                                 this too, so it's read from both places on
#                                 OpenCode and picked up correctly either way.
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

if [ "$MODE" = "uninstall" ]; then
  echo "Removing skilled from $PROJECT_PATH:"
  for dir in "${TARGETS[@]}"; do unlink_all "$dir"; done
  exit 0
fi

echo "Installing skilled into $PROJECT_PATH:"
for dir in "${TARGETS[@]}"; do link_all "$dir"; done

echo
echo "Each skill is a symlink back into this repo, so 'git pull' here updates"
echo "every project it's installed into. Nothing is copied."
echo
echo "Note: only Claude Code understands 'disable-model-invocation'. On OpenCode"
echo "and Antigravity, every skill is model-selectable regardless of that field,"
echo "since both ignore unrecognized frontmatter keys per the open Agent Skills spec."
