#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
bash -n install.sh
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck install.sh skills/git-guardrails/scripts/block-dangerous-git.sh
else
  echo "note: shellcheck not installed, skipping shell lint (install it for stricter checks)" >&2
fi
python3 tests/validate_skills.py "$@"
python3 -m unittest tests.test_install tests.test_git_guardrails -v
