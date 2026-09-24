#!/usr/bin/env python3
"""Blocks destructive git, database and infrastructure commands before they run.

A PreToolUse hook: reads the tool-use payload as JSON on stdin and exits 2
(reason on stderr) to block. Claude Code and deepseek-harness's Claude Code
hooks plugin both read exit 2 as "deny". Standard library only, so it runs
the same under bash, zsh and PowerShell, on Linux, macOS and Windows.

Matches on the actual git invocation (subcommand + flags) per shell segment,
not a raw substring of the whole command line -- a raw substring match both
misses real invocations (`git -C . push`, `git clean -df`) and blocks
harmless ones (any string that merely contains the text "git push").
"""
import json
import re
import shlex
import sys


def block(command, reason):
    print(f"BLOCKED: '{command}' -- {reason}. The user has prevented you from doing this.",
          file=sys.stderr)
    sys.exit(2)


def cluster_has(token, letter):
    """A short-option cluster like -fd, -df, -Dfx contains a given letter
    regardless of order or what else is bundled with it."""
    return token.startswith("-") and not token.startswith("--") and letter in token


def tokenize(segment):
    try:
        return shlex.split(segment)
    except ValueError:  # unbalanced quotes: fall back to plain whitespace
        return segment.split()


def program(token):
    """Basename of a command token, without .exe: /usr/bin/git -> git."""
    return re.sub(r"\.exe$", "", token.replace("\\", "/").rsplit("/", 1)[-1])


def has_seq(tokens, seq):
    """tokens contains seq as a contiguous run, wherever it starts -- so
    `npx prisma migrate reset` and `pnpm exec prisma migrate reset` both
    match ("prisma", "migrate", "reset")."""
    names = [program(t) for t in tokens]
    n = len(seq)
    return any(names[i:i + n] == list(seq) for i in range(len(names) - n + 1))


# Commands that destroy data or infrastructure no `git` undo can bring back.
DESTRUCTIVE = [
    (("terraform", "destroy"), "terraform destroy tears down real infrastructure"),
    (("tofu", "destroy"), "tofu destroy tears down real infrastructure"),
    (("prisma", "migrate", "reset"), "prisma migrate reset drops the database"),
    (("dropdb",), "dropdb deletes a database"),
    (("docker", "volume", "rm"), "docker volume rm deletes stored data"),
    (("docker", "volume", "prune"), "docker volume prune deletes stored data"),
    (("kubectl", "delete", "namespace"), "kubectl delete namespace deletes everything in it"),
    (("kubectl", "delete", "ns"), "kubectl delete ns deletes everything in it"),
]
SQL_CLIENTS = {"psql", "mysql", "mariadb", "sqlite3", "mongosh", "sqlcmd"}
DESTRUCTIVE_SQL = re.compile(r"\b(drop\s+(database|schema|table)|truncate\s+table)\b", re.I)


def check_destructive(command, tokens):
    for seq, reason in DESTRUCTIVE:
        if has_seq(tokens, seq):
            block(command, reason)
    if any(t in ("-destroy", "--destroy") for t in tokens) and has_seq(tokens, ("terraform", "apply")):
        block(command, "terraform apply -destroy tears down real infrastructure")
    if any(program(t) in ("rails", "rake") for t in tokens) and any(
            t in ("db:drop", "db:reset", "db:drop:all") for t in tokens):
        block(command, "db:drop / db:reset deletes the database")
    if any(program(t) in SQL_CLIENTS for t in tokens) and DESTRUCTIVE_SQL.search(" ".join(tokens)):
        block(command, "DROP / TRUNCATE through a database client deletes data")


def check_segment(command, tokens):
    if not tokens:
        return
    check_destructive(command, tokens)
    # Tolerate a path to the binary (/usr/bin/git, git.exe).
    if program(tokens[0]) != "git":
        return
    i = 1
    # Skip git's own global options, so `git -C . push` is still `push`.
    while i < len(tokens):
        t = tokens[i]
        if t in ("-C", "--git-dir", "--work-tree", "-c"):
            i += 2
        elif t.startswith("-"):
            i += 1
        else:
            break
    if i >= len(tokens):
        return
    sub, rest = tokens[i], tokens[i + 1:]

    if sub == "push":
        block(command, "git push is blocked (all forms, including --force)")
    elif sub == "reset" and "--hard" in rest:
        block(command, "git reset --hard discards uncommitted work")
    elif sub == "clean" and any(t == "--force" or cluster_has(t, "f") for t in rest):
        block(command, "git clean with force deletes untracked files")
    elif sub == "branch":
        if "--delete" in rest and ("--force" in rest or "-f" in rest):
            block(command, "git branch --delete --force discards an unmerged branch")
        if any(cluster_has(t, "D") for t in rest):
            block(command, "git branch -D discards an unmerged branch")
    elif sub in ("checkout", "restore"):
        if "." in rest and "-p" not in rest and "--patch" not in rest:
            block(command, f"git {sub} . discards uncommitted changes in the working tree")


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
        command = (payload.get("tool_input") or {}).get("command")
    except (ValueError, AttributeError):
        # Fail closed: an unparseable payload is blocked, not silently allowed.
        print("BLOCKED: could not parse the tool-use payload for a git safety check -- "
              "refusing rather than risk missing a dangerous command.", file=sys.stderr)
        sys.exit(2)
    if not isinstance(command, str) or not command.strip():
        sys.exit(0)
    # Check command-by-command across shell separators (&&, ||, ;, |, newline).
    for segment in re.split(r"&&|\|\||;|\||\n", command):
        check_segment(command, tokenize(segment.strip()))
    sys.exit(0)


if __name__ == "__main__":
    main()
