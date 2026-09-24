#!/usr/bin/env bash
# Thin wrapper: the installer itself is install.py (standard-library Python,
# so it runs the same on Linux, macOS and Windows). Same arguments, e.g.
#   ./install.sh /path/to/project [--claude] [--opencode] [--antigravity]
#                [--codex] [--dsh] [--vendor] [--model-only] [--uninstall]
# See install.py's header for what each flag writes and why.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "error: python3 not found -- skilled's installer (install.py) needs it" >&2
  exit 1
fi
exec "$PYTHON" "$REPO_DIR/install.py" "$@"
