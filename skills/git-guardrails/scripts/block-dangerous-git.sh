#!/bin/bash
# Blocks destructive git subcommands before they run. Matches on the actual
# git invocation (subcommand + flags) per shell segment, not a raw substring
# of the whole command line -- a raw `grep -E` over the full string both
# misses real invocations (`git -C . push`, `git clean -df`) and blocks
# harmless ones (any string that merely contains the text "git push").
set -u

INPUT=$(cat)
COMMAND=$(jq -r '.tool_input.command' <<<"$INPUT" 2>/dev/null)
JQ_STATUS=$?

# Fail closed: if the hook payload can't even be parsed, block rather than
# silently allow -- the original script let a jq parse error fall through to
# an empty $COMMAND, which matches nothing and exits 0.
if [ "$JQ_STATUS" -ne 0 ]; then
  echo "BLOCKED: could not parse the tool-use payload for a git safety check -- refusing rather than risk missing a dangerous command." >&2
  exit 2
fi

# Nothing to run (e.g. tool_input.command absent or empty) -- nothing to block.
[ -z "$COMMAND" ] && [ "$COMMAND" != "null" ] && exit 0
[ "$COMMAND" = "null" ] && exit 0

block() {
  echo "BLOCKED: '$COMMAND' -- $1. The user has prevented you from doing this." >&2
  exit 2
}

# A short-option cluster like "-fd", "-df", "-Dfx" contains a given letter
# regardless of order or what else is bundled with it.
cluster_has() {
  local token="$1" letter="$2"
  [[ "$token" == -* && "$token" != --* && "$token" == *"$letter"* ]]
}

# Split into segments on shell command separators (&&, ||, ;, |) so a
# multi-command line is checked command-by-command, then whitespace-tokenize
# each segment. This is a simplification (it doesn't fully parse quoting the
# way a shell would), but it is a large improvement over substring matching:
# it only ever matches an actual leading `git ...` invocation per segment.
while IFS= read -r segment; do
  [ -n "$segment" ] || continue
  read -ra tokens <<<"$segment"
  [ "${#tokens[@]}" -eq 0 ] && continue

  i=0
  [ "${tokens[$i]}" = "git" ] || continue
  i=$((i + 1))

  # Skip git's own global options that can precede the subcommand, so
  # `git -C . push` / `git --git-dir=x push` are still recognized as `push`.
  while [ "$i" -lt "${#tokens[@]}" ]; do
    case "${tokens[$i]}" in
      -C|--git-dir|--work-tree|-c)
        i=$((i + 2)) ;;
      --git-dir=*|--work-tree=*|--no-pager|--no-replace-objects|--bare)
        i=$((i + 1)) ;;
      -*)
        i=$((i + 1)) ;;
      *)
        break ;;
    esac
  done

  subcommand="${tokens[$i]:-}"
  rest=("${tokens[@]:$((i + 1))}")

  case "$subcommand" in
    push)
      block "git push is blocked (all forms, including --force)"
      ;;
    reset)
      for t in "${rest[@]}"; do
        [ "$t" = "--hard" ] && block "git reset --hard discards uncommitted work"
      done
      ;;
    clean)
      for t in "${rest[@]}"; do
        if [ "$t" = "--force" ] || cluster_has "$t" f; then
          block "git clean with force deletes untracked files"
        fi
      done
      ;;
    branch)
      for t in "${rest[@]}"; do
        if [ "$t" = "--delete" ] && [[ " ${rest[*]} " == *" --force "* || " ${rest[*]} " == *" -f "* ]]; then
          block "git branch --delete --force discards an unmerged branch"
        fi
        cluster_has "$t" D && block "git branch -D discards an unmerged branch"
      done
      ;;
    checkout|restore)
      has_dot=0
      has_patch=0
      for t in "${rest[@]}"; do
        [ "$t" = "." ] && has_dot=1
        { [ "$t" = "-p" ] || [ "$t" = "--patch" ]; } && has_patch=1
      done
      if [ "$has_dot" -eq 1 ] && [ "$has_patch" -eq 0 ]; then
        block "git $subcommand . discards uncommitted changes in the working tree"
      fi
      ;;
  esac
done < <(sed -E 's/(&&|\|\||;|\|)/\n/g' <<<"$COMMAND")

exit 0
