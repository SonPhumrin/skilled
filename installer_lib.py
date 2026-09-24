#!/usr/bin/env python3
"""Ownership manifest + safe-write helpers for install.py.

Imported by install.py, tests/validate_skills.py and tests/test_install.py;
the `python3 installer_lib.py <cmd> ...` CLI below is kept for scripts that
still shell out to it. Keeps a small per-project
manifest (.skilled-install.json) recording exactly which paths this
installer created, what kind of thing each one is, and a fingerprint of what
was written -- so later runs can tell "ours, unchanged", "ours, but the user
edited it since", and "not ours" apart instead of guessing from a filename
or frontmatter match.

The manifest is metadata only: a relative path, its kind, and either a
symlink target or a content fingerprint. It never stores file contents,
secrets, or timestamps.
"""
import hashlib
import json
import os
import sys

MANIFEST_NAME = ".skilled-install.json"
MANIFEST_VERSION = 1


def manifest_path(project):
    return os.path.join(project, MANIFEST_NAME)


def load_manifest(project):
    path = manifest_path(project)
    if not os.path.exists(path):
        return {"version": MANIFEST_VERSION, "entries": {}}
    with open(path, encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        return {"version": MANIFEST_VERSION, "entries": {}}
    data = json.loads(content)
    data.setdefault("entries", {})
    data.setdefault("version", MANIFEST_VERSION)
    return data


def atomic_write_json(path, data):
    directory = os.path.dirname(path) or "."
    tmp = os.path.join(directory, f".{os.path.basename(path)}.tmp.{os.getpid()}")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def save_manifest(project, data):
    atomic_write_json(manifest_path(project), data)


def fingerprint_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def fingerprint_dir(path):
    h = hashlib.sha256()
    for root, dirs, files in os.walk(path):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            # "/" on every OS, so a fingerprint taken on Windows matches one
            # taken on Linux/macOS for the same tree.
            rel = os.path.relpath(full, path).replace(os.sep, "/")
            h.update(rel.encode())
            h.update(b"\0")
            with open(full, "rb") as f:
                h.update(f.read())
            h.update(b"\0")
    return h.hexdigest()


def fingerprint_of(path):
    return fingerprint_dir(path) if os.path.isdir(path) else fingerprint_file(path)


def readlink(path):
    """os.readlink without Windows' \\\\?\\ extended-path prefix, so a link's
    target compares equal to the plain path it was created from."""
    target = os.readlink(path)
    return target[4:] if target.startswith("\\\\?\\") else target


def is_user_invoked(skill_dir):
    """True when the skill's SKILL.md frontmatter sets
    `disable-model-invocation: true` (CONVENTIONS.md "Invocation is the one
    axis")."""
    with open(os.path.join(skill_dir, "SKILL.md"), encoding="utf-8") as f:
        lines = f.read().splitlines()
    if not lines or lines[0].strip() != "---":
        return False
    for line in lines[1:]:
        if line.strip() == "---":
            break
        key, _, value = line.partition(":")
        if key.strip() == "disable-model-invocation":
            return value.strip().strip("\"'").lower() == "true"
    return False


def check_entry(project, rel_path, kind, expected_target=None):
    """Classify what's at rel_path relative to the manifest.

    `kind` is the kind being *requested* (what the caller wants to write).
    Ownership itself is checked against whatever kind the manifest last
    recorded, not the requested one -- a deliberate symlink<->vendor mode
    conversion of a path skilled already owns is fine as long as nothing
    else touched it since; the caller is responsible for fully removing the
    old artifact (symlink or real file/dir) before writing the new kind,
    since neither `ln -sfn` over a real directory nor `cp` over a symlink is
    safe on its own.

    Returns one of:
      absent          nothing on disk -- safe to create
      owned-current   manifest says we own it (any kind), on-disk state
                       still matches what we last recorded -- safe to
                       remove and rewrite, as the requested kind
      owned-stale     manifest says we own it, but it changed since --
                       DO NOT touch it; the user (or something else) edited it
      legacy-symlink  no manifest entry, but it's already a symlink pointing
                       exactly at expected_target -- a pre-manifest skilled
                       install; safe to adopt into the manifest
      conflict        something else is there that isn't ours -- refuse
    """
    full = os.path.join(project, rel_path)
    data = load_manifest(project)
    entry = data["entries"].get(rel_path)
    exists = os.path.lexists(full)

    if not exists:
        return "absent"

    if entry:
        recorded_kind = entry.get("kind")
        if recorded_kind == "symlink":
            matches = os.path.islink(full) and readlink(full) == entry.get("target")
        else:
            matches = (not os.path.islink(full)) and fingerprint_of(full) == entry.get("fingerprint")
        return "owned-current" if matches else "owned-stale"

    if kind == "symlink" and expected_target is not None and os.path.islink(full) and readlink(full) == expected_target:
        return "legacy-symlink"
    return "conflict"


def record_entry(project, rel_path, kind, source=None):
    """Record rel_path in the manifest, deriving target/fingerprint from
    what's actually on disk right now (call this right after writing it)."""
    full = os.path.join(project, rel_path)
    entry = {"kind": kind}
    if kind == "symlink":
        entry["target"] = readlink(full)
    else:
        entry["fingerprint"] = fingerprint_of(full)
    if source:
        entry["source"] = source
    data = load_manifest(project)
    data["entries"][rel_path] = entry
    save_manifest(project, data)


def remove_entry(project, rel_path):
    data = load_manifest(project)
    if rel_path in data["entries"]:
        del data["entries"][rel_path]
        save_manifest(project, data)


def entry_kind(project, rel_path):
    data = load_manifest(project)
    entry = data["entries"].get(rel_path)
    return entry.get("kind") if entry else None


def validate_json_object(path):
    """Exit 1 (with a message) if path exists and is not a valid JSON object.
    Absent file is fine -- it'll be created."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        return
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"error: {path} is not valid JSON ({e}) -- refusing to touch it", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, dict):
        print(f"error: {path} is not a JSON object at the top level -- refusing to touch it", file=sys.stderr)
        sys.exit(1)


def validate_field_type(path, field, expected_type, type_name):
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        return
    data = json.loads(content)
    if not isinstance(data, dict):
        return  # caught by validate_json_object
    cur = data
    parts = field.split(".")
    for part in parts[:-1]:
        if part not in cur:
            return
        cur = cur[part]
        if not isinstance(cur, dict):
            print(f"error: {path} field '{field}' -- '{part}' is not an object -- refusing to touch it", file=sys.stderr)
            sys.exit(1)
    last = parts[-1]
    if last in cur and not isinstance(cur[last], expected_type):
        print(f"error: {path} field '{field}' must be a {type_name} -- refusing to touch it", file=sys.stderr)
        sys.exit(1)


def _main():
    if len(sys.argv) < 2:
        print("usage: installer_lib.py <check|record|remove|entry-kind|validate-json|validate-field> ...", file=sys.stderr)
        sys.exit(2)
    cmd = sys.argv[1]
    args = sys.argv[2:]

    if cmd == "check":
        project, rel_path, kind = args[0], args[1], args[2]
        expected_target = args[3] if len(args) > 3 and args[3] else None
        print(check_entry(project, rel_path, kind, expected_target))
    elif cmd == "record":
        project, rel_path, kind = args[0], args[1], args[2]
        source = args[3] if len(args) > 3 and args[3] else None
        record_entry(project, rel_path, kind, source)
    elif cmd == "remove":
        project, rel_path = args[0], args[1]
        remove_entry(project, rel_path)
    elif cmd == "entry-kind":
        project, rel_path = args[0], args[1]
        kind = entry_kind(project, rel_path)
        if kind:
            print(kind)
    elif cmd == "validate-json":
        validate_json_object(args[0])
    elif cmd == "validate-field":
        path, field, type_name = args[0], args[1], args[2]
        expected = {"list": list, "dict": dict}[type_name]
        validate_json_object(path)
        validate_field_type(path, field, expected, type_name)
    else:
        print(f"error: unknown command {cmd}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    _main()
