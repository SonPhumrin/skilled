#!/usr/bin/env python3
"""Structural validation for every skill in this repo.

Cannot verify: whether a skill actually fires when it should (that needs a
live agent session — see tests/MANUAL-CHECKS.md). This checks everything
that's checkable from disk: frontmatter, naming, cross-references, and
single-source-of-truth across the design skills.

Pass --project /path/to/repo to additionally check that repo's per-project
install (written by install.sh) resolves back into this repo.
"""
import json
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
SKILLS_DIR = REPO / "skills"

# Fields understood by at least one supported harness (Claude Code, OpenCode,
# Antigravity). Anything outside this set is a typo, not a portable extension.
KNOWN_FIELDS = {
    "name", "description", "when_to_use", "argument-hint", "arguments",
    "disable-model-invocation", "user-invocable", "allowed-tools",
    "disallowed-tools", "model", "effort", "context", "agent", "background",
    "hooks", "paths", "shell", "metadata", "license", "compatibility",
}
DESCRIPTION_CAP = 1536  # Claude Code truncates description+when_to_use here

errors = []
warnings = []


def fail(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def parse_frontmatter(path):
    lines = path.read_text().split("\n")
    if not lines or lines[0] != "---":
        fail(f"{path}: no frontmatter (must open with '---' on line 1)")
        return None, None
    try:
        end = lines.index("---", 1)
    except ValueError:
        fail(f"{path}: unterminated frontmatter")
        return None, None
    fields = {}
    for ln in lines[1:end]:
        if not ln.strip() or ln.startswith((" ", "\t", "-")):
            continue
        m = re.match(r"^([A-Za-z_-]+):\s*(.*)$", ln)
        if not m:
            fail(f"{path}: unparseable frontmatter line: {ln!r}")
            continue
        fields[m.group(1)] = m.group(2).strip().strip('"')
    body = "\n".join(lines[end + 1:])
    return fields, body


def check_frontmatter():
    skill_dirs = sorted(p for p in SKILLS_DIR.iterdir() if p.is_dir())
    if not skill_dirs:
        fail("no skill directories found under skills/")
        return {}, set()

    names = {}
    user_invoked = set()
    for d in skill_dirs:
        skill_md = d / "SKILL.md"
        if not skill_md.exists():
            fail(f"{d.name}: missing SKILL.md")
            continue
        fields, _ = parse_frontmatter(skill_md)
        if fields is None:
            continue

        if "name" not in fields:
            fail(f"{d.name}: frontmatter missing required 'name'")
        elif fields["name"] != d.name:
            fail(f"{d.name}: name: {fields['name']!r} does not match directory name")

        if "description" not in fields:
            fail(f"{d.name}: frontmatter missing required 'description'")
        else:
            length = len(fields["description"]) + len(fields.get("when_to_use", ""))
            if length > DESCRIPTION_CAP:
                warn(f"{d.name}: description(+when_to_use) is {length} chars, "
                     f"over the {DESCRIPTION_CAP}-char Claude Code listing cap")

        unknown = set(fields) - KNOWN_FIELDS
        if unknown:
            fail(f"{d.name}: unknown frontmatter field(s): {sorted(unknown)}")

        if fields.get("disable-model-invocation", "").lower() == "true":
            user_invoked.add(d.name)

        names[d.name] = fields
    return names, user_invoked


def check_cross_references(known_names):
    """Every 'Skill tool with "x"' and bare /x mention must name a real skill."""
    ignore = {"settings", "users", "skill", "name", "clear", "compact", "review"}
    for f in sorted(SKILLS_DIR.rglob("*.md")):
        s = f.read_text()
        refs = set(re.findall(r'Skill tool with "([a-z0-9-]+)"', s))
        refs |= set(re.findall(r'(?:^|[\s(`*])/([a-z][a-z0-9-]{3,})\b', s))
        for r in refs - known_names - ignore:
            fail(f"{f.relative_to(REPO)}: references unknown skill '{r}'")


def check_no_relative_skill_links():
    """Convention: reach other skills via the Skill tool, not ../other/FILE.md."""
    for f in sorted(SKILLS_DIR.rglob("*.md")):
        if f.parent == SKILLS_DIR:
            continue
        for m in re.finditer(r"\]\((\.\./[^)]+)\)", f.read_text()):
            fail(f"{f.relative_to(REPO)}: relative cross-skill link {m.group(1)!r} "
                 f"(should be a Skill tool call instead)")


def check_single_source_of_truth():
    """Design-altitude terms should each be owned by exactly one skill."""
    design_skills = ["code-craft", "module-design"]
    owned_terms = {
        "SOLID": "module-design",
        "rule of three": "code-craft",
        "Law of Demeter": "code-craft",
        "command-query separation": "code-craft",
    }
    for term, owner in owned_terms.items():
        hits = []
        for name in design_skills:
            # A skill's content may be split across SKILL.md and any bundled
            # reference/*.md files (progressive disclosure), so check the
            # whole skill directory, not just the entry-point file.
            body = "\n".join(
                f.read_text() for f in (SKILLS_DIR / name).rglob("*.md")
            )
            # A one-line pointer ("call the Skill tool with ...") that merely
            # names the term to redirect elsewhere is not a duplication; only
            # flag a term explained at length (3+ hits) outside its owner.
            count = len(re.findall(re.escape(term), body, re.IGNORECASE))
            if count >= 3:
                hits.append(name)
        others = [h for h in hits if h != owner]
        if others:
            warn(f"'{term}' (owned by {owner}) is explained at length in: {others}")


def _check_skill_entry(project_path, target, name, install_kind):
    """One skill's entry under a .claude/skills or .agents/skills target
    directory. Accepts install.sh's modes: a symlink resolving back into
    this repo (default), a symlink resolving to this project's own
    .claude/skills/<name> (--vendor with both --claude and --antigravity,
    where .agents/skills cross-links instead of duplicating the copy), or a
    real directory whose SKILL.md frontmatter name matches and whose
    content is identical to the source (--vendor otherwise). A vendored
    copy that exists but differs from the source is flagged separately from
    a missing one, since that's staleness -- re-run `--vendor`, not
    `install.sh` from scratch."""
    entry = target / name
    if not entry.exists():
        warn(f"{target}/{name} missing (run ./install.sh {install_kind})")
        return
    if entry.is_symlink():
        valid_targets = {
            (SKILLS_DIR / name).resolve(),
            (project_path / ".claude" / "skills" / name).resolve(),
        }
        if entry.resolve() not in valid_targets:
            fail(f"{target}/{name} points somewhere else: {entry.resolve()}")
        return
    # Not a symlink: only valid if it's a --vendor copy of this exact skill.
    skill_md = entry / "SKILL.md"
    source_md = SKILLS_DIR / name / "SKILL.md"
    if not skill_md.is_file() or f"name: {name}" not in skill_md.read_text():
        warn(f"{target}/{name} exists but is neither a symlink to this repo "
             f"nor a vendored copy of it")
    elif skill_md.read_text() != source_md.read_text():
        warn(f"{target}/{name} is a vendored copy that's out of date "
             f"(re-run ./install.sh {install_kind} --vendor)")


def check_install_state(project_path):
    """If a project path was given, check its install.sh output in whichever
    mode it was installed: symlink (default, resolves back into this repo)
    or --vendor (real copies, checked for staleness against the source).
    Also checks .agents/skills.json and opencode.json register a path that
    matches one of the two modes. With no project path, this is a no-op:
    install is per-project now, and there is no single global location to
    assume."""
    if project_path is None:
        return
    targets = [project_path / ".claude" / "skills", project_path / ".agents" / "skills"]
    skill_dirs = {p.name for p in SKILLS_DIR.iterdir() if p.is_dir()}
    for target in targets:
        if not target.is_dir():
            warn(f"{target} does not exist (run ./install.sh {project_path})")
            continue
        for name in skill_dirs:
            _check_skill_entry(project_path, target, name, str(project_path))

    valid_antigravity_paths = {str(SKILLS_DIR), ".agents/skills", ".claude/skills"}
    skills_json = project_path / ".agents" / "skills.json"
    if not skills_json.is_file():
        warn(f"{skills_json} does not exist (run ./install.sh {project_path}); "
             f"Antigravity may not discover these skills without it")
    else:
        try:
            data = json.loads(skills_json.read_text() or "{}")
        except json.JSONDecodeError as e:
            fail(f"{skills_json} is not valid JSON: {e}")
        else:
            paths = {e.get("path") for e in data.get("entries", [])}
            if not (paths & valid_antigravity_paths):
                warn(f"{skills_json} has no entry for this repo "
                     f"(run ./install.sh {project_path})")

    # OpenCode's external-skill auto-load only scans ~/.claude/ and
    # ~/.agents/ (global, per its own docs) -- never a project's
    # .claude/skills or .agents/skills. Project-scoped skills need the
    # "skills": {"paths": [...]} entry in opencode.json instead.
    valid_opencode_paths = {str(SKILLS_DIR), ".claude/skills", ".agents/skills"}
    oc_json = project_path / "opencode.json"
    oc_jsonc = project_path / "opencode.jsonc"
    oc_nested = project_path / ".opencode" / "opencode.json"
    if oc_jsonc.is_file() and not oc_json.is_file() and not oc_nested.is_file():
        warn(f"{oc_jsonc} exists as JSONC; install.sh does not auto-edit it. "
             f'Add by hand: {{"skills": {{"paths": ["{SKILLS_DIR}"]}}}}')
    else:
        oc_target = oc_json if oc_json.is_file() else oc_nested
        if not oc_target.is_file():
            warn(f"{oc_json} does not exist (run ./install.sh {project_path}); "
                 f"OpenCode has no project-level auto-scan, so it won't see "
                 f"these skills without it")
        else:
            try:
                data = json.loads(oc_target.read_text() or "{}")
            except json.JSONDecodeError as e:
                fail(f"{oc_target} is not valid JSON: {e}")
            else:
                paths = set(data.get("skills", {}).get("paths", []))
                if not (paths & valid_opencode_paths):
                    warn(f"{oc_target} has no skills.paths entry for this repo "
                         f"(run ./install.sh {project_path})")


def check_reserved_and_collisions():
    skill_dirs = {p.name for p in SKILLS_DIR.iterdir() if p.is_dir()}
    if "synced" in skill_dirs:
        fail("'synced' is a reserved directory name in Claude Code skill locations")
    # code-review is the bundled Claude Code skill name; ours must not shadow it
    if "code-review" in skill_dirs:
        fail("a skill literally named 'code-review' shadows Claude Code's bundled "
             "/code-review and breaks the /review alias")


def main():
    project_path = None
    args = sys.argv[1:]
    if len(args) >= 2 and args[0] == "--project":
        project_path = pathlib.Path(args[1]).expanduser().resolve()

    names, user_invoked = check_frontmatter()
    known = set(names)
    check_cross_references(known)
    check_no_relative_skill_links()
    check_single_source_of_truth()
    check_reserved_and_collisions()
    check_install_state(project_path)

    total = len(names)
    print(f"skills checked: {total}  (user-invoked: {len(user_invoked)}, "
          f"model-invoked: {total - len(user_invoked)})")

    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print(f"  WARN  {w}")

    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors:
            print(f"  FAIL  {e}")
        print(f"\nFAILED: {len(errors)} error(s), {len(warnings)} warning(s)")
        sys.exit(1)

    print(f"\nPASSED: 0 errors, {len(warnings)} warning(s)")


if __name__ == "__main__":
    main()
