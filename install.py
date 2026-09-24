#!/usr/bin/env python3
"""Install skilled into a single project, for the harnesses you actually use
there. Every location this writes is project-scoped -- nothing here touches a
global (home-directory) config, on any harness. Standard library only, and
runs the same on Linux, macOS and Windows.

Usage:
  python3 install.py /path/to/project [harness flags...] [--vendor] [--model-only]
  python3 install.py /path/to/project [harness flags...] --uninstall

(`./install.sh ...` is a thin wrapper that calls this with the same arguments.)

Harness flags. None given = --claude --opencode --antigravity (the original
default). Pass one or more to install only those.

  --claude       <project>/.claude/skills   Claude Code's native project scope.
  --antigravity  <project>/.agents/skills   Antigravity's native project scope,
                 PLUS <project>/.agents/skills.json. Antigravity's own logs
                 show the native scan can go stale on a symlinked folder, and
                 its docs recommend this file for skills outside its default
                 discovery locations. Belt and suspenders, not a swap --
                 written even in --vendor mode, with a project-relative path.
  --codex        <project>/.agents/skills   Codex CLI's project scope. Codex
                 ignores `disable-model-invocation`; each user-invoked skill
                 carries agents/openai.yaml (allow_implicit_invocation: false)
                 instead, so it stays out of Codex's implicit catalog.
  --dsh          <project>/.agents/skills   deepseek-harness's project scope.
  --opencode     <project>/opencode.json    Belt and suspenders: current
                 OpenCode (v1.18.30+) also discovers project .claude/skills,
                 .agents/skills and .opencode/{skill,skills} natively, but this
                 "skills": {"paths": [...]} registration still matters for an
                 --opencode-only symlink install, or a project that disabled
                 native discovery. In --vendor mode it points at whichever
                 directory actually got vendored (.claude/skills if --claude
                 ran, else .agents/skills, else .claude/skills is vendored
                 anyway just to give OpenCode something to point at).

Distribution modes:

  Symlink (default). Each skill is a symlink back into THIS repo, at its
  absolute path on THIS machine. `git pull` here updates every project it's
  installed into instantly -- but only on the machine that ran the install.
  Right model for a solo dev's own machine across several personal repos.
  Where symlinks can't be created (Windows without Developer Mode, some
  network drives), each skill falls back to a real copy, with a note.

  --vendor. Copies real files into the project and registers paths relative
  to the project. Self-contained and git-add-able: a coworker who clones the
  project gets working skills with no separate checkout of this repo. It goes
  stale like any vendored dependency -- re-run `--vendor` to resync.

  --model-only. Installs only the model-invoked skills. For projects driven
  by a harness that serves the user-invoked skills itself (see HARNESS.md):
  those then cost zero context on every agent, including the ones that ignore
  `disable-model-invocation`. Switching an existing install to --model-only
  removes the user-invoked skills it had installed, if they are unmodified.

Every write that isn't a plain symlink goes through the ownership manifest
(.skilled-install.json in the target project) instead of inferring "is this
ours" from a filename or frontmatter match -- see installer_lib.py.
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
SKILLS_DIR = os.path.join(REPO_DIR, "skills")
sys.path.insert(0, REPO_DIR)
import installer_lib as lib  # noqa: E402 -- needs REPO_DIR on sys.path first

# Every value this installer has ever registered in .agents/skills.json or
# opencode.json, across both modes -- used on --uninstall so a stale entry is
# removed even when this uninstall's flags don't match the original install's.
KNOWN_PATHS = (SKILLS_DIR, ".claude/skills", ".agents/skills")


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def warn(msg):
    print(f"  warning: {msg}", file=sys.stderr)


def all_skills():
    return sorted(
        name for name in os.listdir(SKILLS_DIR)
        if os.path.isfile(os.path.join(SKILLS_DIR, name, "SKILL.md"))
    )


def remove_path(path):
    """rm -rf for whatever is there: symlink, file, or directory. A symlink
    is always unlinked, never followed -- following one would delete the
    repo's own source directory."""
    if os.path.islink(path) or os.path.isfile(path):
        os.remove(path)
    elif os.path.isdir(path):
        shutil.rmtree(path)


def try_symlink(target, link):
    """Create a directory symlink. False if the OS or filesystem refuses
    (Windows without Developer Mode, some network drives)."""
    if os.environ.get("SKILLED_NO_SYMLINKS"):
        return False
    try:
        os.symlink(target, link, target_is_directory=True)
        return True
    except (OSError, NotImplementedError):
        return False


class Installer:
    def __init__(self, project, args):
        self.project = project
        self.args = args
        self.symlink_fallbacks = 0

    def rel(self, path):
        return os.path.relpath(path, self.project).replace(os.sep, "/")

    # -- one skill entry ---------------------------------------------------

    def _copy(self, name, dest, rel):
        remove_path(dest)
        shutil.copytree(os.path.join(SKILLS_DIR, name), dest)
        lib.record_entry(self.project, rel, "vendor-dir", f"skill:{name}")

    def _place(self, name, target_dir, link_target):
        """Install one skill under target_dir: a symlink to link_target, or a
        real copy when link_target is None. Returns 'ok' or 'conflict'."""
        dest = os.path.join(target_dir, name)
        rel = self.rel(dest)
        if link_target is None:
            status = lib.check_entry(self.project, rel, "vendor-dir")
            if status not in ("absent", "owned-current"):
                warn(f"{dest} exists and isn't skilled's own unmodified vendored copy of "
                     f"'{name}' -- skipped. If this is a stale pre-manifest skilled copy, "
                     f"delete it and re-run install to adopt it; if it's your own, nothing "
                     f"was touched.")
                return "conflict"
            self._copy(name, dest, rel)
            return "ok"

        status = lib.check_entry(self.project, rel, "symlink", link_target)
        if status not in ("absent", "owned-current", "legacy-symlink"):
            warn(f"{dest} exists and isn't a skilled-managed install of '{name}' -- skipped. "
                 f"Back it up and remove it by hand if you want skilled to manage this name.")
            return "conflict"
        # Remove first: a symlink can't safely replace a real directory (e.g.
        # converting a prior --vendor install back to symlink mode).
        remove_path(dest)
        if try_symlink(link_target, dest):
            lib.record_entry(self.project, rel, "symlink", f"skill:{name}")
        else:
            self.symlink_fallbacks += 1
            self._copy(name, dest, rel)
        return "ok"

    def _prune_unselected(self, target_dir, selected):
        """--model-only: drop skills this installer placed earlier that are no
        longer selected, but only while they're unmodified (owned-current)."""
        removed = 0
        for name in all_skills():
            if name in selected:
                continue
            dest = os.path.join(target_dir, name)
            rel = self.rel(dest)
            kind = lib.entry_kind(self.project, rel)
            if kind and lib.check_entry(self.project, rel, kind) == "owned-current":
                remove_path(dest)
                lib.remove_entry(self.project, rel)
                removed += 1
        return removed

    def install_dir(self, target_dir, skills, how):
        """how: 'link' (to this repo), 'copy', or 'crosslink' (relative link
        to the project's own .claude/skills/<name>, --vendor with both
        .claude/skills and .agents/skills requested: one vendored copy, not
        two)."""
        os.makedirs(target_dir, exist_ok=True)
        placed = conflicts = 0
        for name in skills:
            if how == "link":
                link_target = os.path.join(SKILLS_DIR, name)
            elif how == "crosslink":
                link_target = os.path.join("..", "..", ".claude", "skills", name)
            else:
                link_target = None
            if self._place(name, target_dir, link_target) == "ok":
                placed += 1
            else:
                conflicts += 1
        pruned = self._prune_unselected(target_dir, set(skills))
        verb = {"link": "symlinked", "copy": "copied",
                "crosslink": "symlinked from .claude/skills"}[how]
        extra = f", {conflicts} conflict(s) skipped" if conflicts else ""
        extra += f", {pruned} unselected removed" if pruned else ""
        print(f"  {target_dir}  ({placed} skills {verb}{extra})")

    def remove_dir(self, target_dir):
        """Single removal path for every install shape (symlink, vendored
        copy, cross-link, copy fallback): reads the manifest to find out
        what's actually on disk instead of trusting this invocation's flags,
        and only removes an entry that's still exactly as recorded."""
        if not os.path.isdir(target_dir):
            return
        removed = kept = 0
        for name in all_skills():
            dest = os.path.join(target_dir, name)
            if not os.path.lexists(dest):
                continue
            rel = self.rel(dest)
            kind = lib.entry_kind(self.project, rel)
            if not kind:
                continue  # never installed by skilled -- never touch it
            if lib.check_entry(self.project, rel, kind) == "owned-current":
                remove_path(dest)
                lib.remove_entry(self.project, rel)
                removed += 1
            else:
                warn(f"{dest} changed since skilled installed it -- left in place. "
                     f"Remove it by hand if you want it gone.")
                kept += 1
        extra = f", {kept} left in place" if kept else ""
        print(f"  {target_dir}  (removed {removed}{extra})")


# -- harness config files ----------------------------------------------------

def load_json(path):
    with open(path, encoding="utf-8") as f:
        content = f.read().strip()
    return json.loads(content) if content else {}


def write_skills_json(agents_dir, register_path):
    """Antigravity: register a path in .agents/skills.json via its documented
    {"entries": [{"path": ...}]} schema, merging into an existing file so a
    project's own entries survive."""
    json_file = os.path.join(agents_dir, "skills.json")
    os.makedirs(agents_dir, exist_ok=True)
    data = load_json(json_file) if os.path.exists(json_file) else {}
    entries = data.setdefault("entries", [])
    if not any(e.get("path") == register_path for e in entries):
        entries.append({"path": register_path})
    lib.atomic_write_json(json_file, data)
    print(f"  {json_file}  (registered {register_path})")


def remove_skills_json_entry(agents_dir):
    json_file = os.path.join(agents_dir, "skills.json")
    if not os.path.isfile(json_file):
        return
    data = load_json(json_file)
    entries = [e for e in data.get("entries", []) if e.get("path") not in KNOWN_PATHS]
    if entries:
        data["entries"] = entries
        lib.atomic_write_json(json_file, data)
    elif set(data) - {"entries"}:
        data.pop("entries", None)
        lib.atomic_write_json(json_file, data)
    else:
        os.remove(json_file)
    print(f"  {json_file}  (unregistered)")


def write_opencode_config(project, register_path):
    """OpenCode checks ./opencode.json, ./opencode.jsonc, then
    .opencode/opencode.json; edit whichever exists, or create
    ./opencode.json. A .jsonc is never auto-edited (comments don't survive a
    JSON round-trip) -- printed as a manual instruction instead."""
    candidates = [os.path.join(project, "opencode.json"),
                  os.path.join(project, ".opencode", "opencode.json")]
    jsonc = os.path.join(project, "opencode.jsonc")
    if os.path.isfile(candidates[0]):
        target = candidates[0]
    elif os.path.isfile(jsonc):
        print(f"  {jsonc} exists; skilled won't auto-edit JSONC (comments don't survive a rewrite).",
              file=sys.stderr)
        print(f'    Add by hand: {{"skills": {{"paths": ["{register_path}"]}}}}', file=sys.stderr)
        return
    elif os.path.isfile(candidates[1]):
        target = candidates[1]
    else:
        target = candidates[0]

    created = not os.path.exists(target)
    data = {} if created else load_json(target)
    if created:
        data["$schema"] = "https://opencode.ai/config.json"
    paths = data.setdefault("skills", {}).setdefault("paths", [])
    if register_path not in paths:
        paths.append(register_path)
    lib.atomic_write_json(target, data)
    print(f"  {target}  (registered {register_path})")


def remove_opencode_config_entry(project):
    target = next((c for c in (os.path.join(project, "opencode.json"),
                               os.path.join(project, ".opencode", "opencode.json"))
                   if os.path.isfile(c)), None)
    if not target:
        return
    data = load_json(target)
    skills = data.get("skills", {})
    paths = [p for p in skills.get("paths", []) if p not in KNOWN_PATHS]
    if paths:
        skills["paths"] = paths
        data["skills"] = skills
    else:
        skills.pop("paths", None)
        if skills:
            data["skills"] = skills
        else:
            data.pop("skills", None)
    if set(data) - {"$schema"}:
        lib.atomic_write_json(target, data)
    else:
        os.remove(target)
    print(f"  {target}  (unregistered)")


# -- nested roots --------------------------------------------------------------

def detect_nested_roots(project, vendor):
    """Report nested roots this install did NOT reach: git submodules and
    monorepo workspace packages. Reported only, never auto-installed: whether
    a nested path is a real work surface or a vendored dependency needs a
    human (or an agent) to judge, not a glob match."""
    found = []

    if os.path.isfile(os.path.join(project, ".gitmodules")):
        try:
            out = subprocess.run(
                ["git", "-C", project, "config", "-f", ".gitmodules", "--get-regexp", r"\.path$"],
                capture_output=True, text=True).stdout
        except OSError:
            out = ""
        for line in out.splitlines():
            parts = line.split(None, 1)
            if len(parts) == 2 and os.path.isdir(os.path.join(project, parts[1])):
                found.append(os.path.join(project, parts[1]))

    patterns = []
    package_json = os.path.join(project, "package.json")
    if os.path.isfile(package_json):
        try:
            ws = load_json(package_json).get("workspaces")
        except (ValueError, OSError, AttributeError):
            ws = None
        if isinstance(ws, dict):
            ws = ws.get("packages", [])
        patterns += [p for p in (ws or []) if isinstance(p, str)]
    pnpm = os.path.join(project, "pnpm-workspace.yaml")
    if os.path.isfile(pnpm):
        with open(pnpm, encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if s.startswith("-"):
                    item = s[1:].split("#", 1)[0].strip().strip("'\"")
                    if item:
                        patterns.append(item)
    for pattern in patterns:
        for d in glob.glob(os.path.join(project, pattern)):
            if os.path.isdir(d) and os.path.isfile(os.path.join(d, "package.json")):
                found.append(os.path.normpath(d))

    unique = list(dict.fromkeys(found))
    if not unique:
        return
    print()
    print(f"Found {len(unique)} nested root(s) this install does not reach (each is its own")
    print("project scope to an agent launched from inside it directly -- a submodule is a")
    print("separate git repo, a workspace package is a directory someone might cd into).")
    print("Not installed automatically -- only run this for the ones that are real work")
    print("surfaces, not vendored dependencies:")
    flag = " --vendor" if vendor else ""
    for f in unique:
        print(f"  python3 {os.path.join(REPO_DIR, 'install.py')} {f}{flag}")


# -- main ----------------------------------------------------------------------

def parse_args(argv):
    p = argparse.ArgumentParser(
        prog="install.py", add_help=True,
        description="Install skilled into one project. See the module docstring for details.")
    p.add_argument("project")
    for flag in ("claude", "opencode", "antigravity", "codex", "dsh", "vendor",
                 "model-only", "uninstall"):
        p.add_argument(f"--{flag}", action="store_true")
    args = p.parse_args(argv)
    if not any((args.claude, args.opencode, args.antigravity, args.codex, args.dsh)):
        args.claude = args.opencode = args.antigravity = True
    return args


def preflight(project, args):
    """Validate every config file this run will touch BEFORE any mutation, so
    malformed JSON aborts with a diagnostic instead of failing partway."""
    checks = [(os.path.join(project, lib.MANIFEST_NAME), "entries", dict)]
    if args.antigravity:
        checks.append((os.path.join(project, ".agents", "skills.json"), "entries", list))
    if args.opencode:
        for c in (os.path.join(project, "opencode.json"),
                  os.path.join(project, ".opencode", "opencode.json")):
            checks += [(c, "skills", dict), (c, "skills.paths", list)]
    for path, field, typ in checks:
        lib.validate_json_object(path)
        lib.validate_field_type(path, field, typ, "list" if typ is list else "dict")


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    if not os.path.isdir(args.project):
        die(f"{args.project} is not a directory")
    project = os.path.realpath(args.project)
    agents_dir_wanted = args.antigravity or args.codex or args.dsh

    # --vendor with --opencode alone needs a vendored copy to point at.
    if args.vendor and args.opencode and not args.claude and not agents_dir_wanted:
        args.claude = True
        print("note: --vendor --opencode alone needs a vendored copy to point at; "
              "vendoring into .claude/skills too.")

    preflight(project, args)
    inst = Installer(project, args)
    claude_dir = os.path.join(project, ".claude", "skills")
    agents_dir = os.path.join(project, ".agents", "skills")

    if args.uninstall:
        print(f"Removing skilled from {project}:")
        if args.claude:
            inst.remove_dir(claude_dir)
        if agents_dir_wanted:
            inst.remove_dir(agents_dir)
        if args.antigravity:
            remove_skills_json_entry(os.path.join(project, ".agents"))
        if args.opencode:
            remove_opencode_config_entry(project)
        manifest = lib.manifest_path(project)
        if os.path.isfile(manifest) and not lib.load_manifest(project)["entries"]:
            os.remove(manifest)
        # Tidy the directories an install created, but only while empty:
        # os.rmdir refuses a directory that still holds anything.
        for d in (claude_dir, os.path.dirname(claude_dir), agents_dir, os.path.dirname(agents_dir)):
            try:
                os.rmdir(d)
            except OSError:
                pass
        return 0

    skills = all_skills()
    if args.model_only:
        skills = [s for s in skills if not lib.is_user_invoked(os.path.join(SKILLS_DIR, s))]

    if args.vendor:
        register = ".claude/skills" if args.claude else ".agents/skills"
    else:
        register = SKILLS_DIR

    print(f"Installing skilled into {project}:")
    if args.claude:
        inst.install_dir(claude_dir, skills, "copy" if args.vendor else "link")
    if agents_dir_wanted:
        if args.vendor:
            inst.install_dir(agents_dir, skills, "crosslink" if args.claude else "copy")
        else:
            inst.install_dir(agents_dir, skills, "link")
    if args.antigravity:
        write_skills_json(os.path.join(project, ".agents"), register)
    if args.opencode:
        write_opencode_config(project, register)
    detect_nested_roots(project, args.vendor)

    print()
    if inst.symlink_fallbacks:
        print(f"Note: symlinks aren't available here, so {inst.symlink_fallbacks} skill(s) were "
              f"copied instead. Re-run this install after skilled updates to resync them "
              f"(on Windows, enabling Developer Mode allows symlinks).")
    if args.vendor:
        print("Vendored: real copies, not symlinks. git add-able, works for anyone who clones")
        print("this project without a separate checkout of skilled. Re-run '--vendor' after")
        print("skilled updates to resync -- nothing here detects staleness automatically.")
    else:
        print("Each skill links back into this repo, so 'git pull' here updates every project")
        print("it's installed into. This only works on this machine -- see '--vendor' if this")
        print("project is shared with others.")
    if args.model_only:
        print("\n--model-only: user-invoked skills were not installed; your harness serves")
        print("them from skills.json (see HARNESS.md).")
    elif args.opencode:
        print("\nNote: OpenCode ignores 'disable-model-invocation', so there every skill is")
        print("model-selectable. Use --model-only with a harness that serves the user-invoked")
        print("skills itself to avoid that (see HARNESS.md).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
