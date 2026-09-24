#!/usr/bin/env python3
"""Regression tests for the installer's ownership-manifest safety.

Runs install.py (and, on POSIX, its install.sh wrapper) against a small isolated fake "skilled repo" (a couple of
fake skills) inside a tempdir -- never
against this actual repo or the user's home/projects. Standard library only
(subprocess + tempfile + unittest), matching the rest of this repo's
zero-dependency test setup.

Each test reproduces one of the data-loss bugs this manifest was built to
close and asserts it no longer happens.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)
import installer_lib  # noqa: E402 -- needs REPO_ROOT on sys.path first


def _can_symlink():
    probe = tempfile.mkdtemp(prefix="skilled-symlink-probe-")
    try:
        os.symlink(probe, os.path.join(probe, "link"), target_is_directory=True)
        return True
    except (OSError, NotImplementedError):
        return False
    finally:
        shutil.rmtree(probe, ignore_errors=True)


CAN_SYMLINK = _can_symlink()
needs_symlinks = unittest.skipUnless(CAN_SYMLINK, "symlinks unavailable on this machine")


def build_fake_repo(root):
    """A minimal stand-in for the real skilled repo: 2 fake skills (one of
    them user-invoked), this repo's real install.py + install.sh +
    installer_lib.py.
    Keeps tests fast and, critically, means a bug in a test can never touch
    this actual repo's real files."""
    repo = os.path.join(root, "fake-skilled-repo")
    os.makedirs(os.path.join(repo, "skills", "skill-a"))
    os.makedirs(os.path.join(repo, "skills", "skill-b"))

    for script in ("install.sh", "install.py", "installer_lib.py"):
        shutil.copy(os.path.join(REPO_ROOT, script), os.path.join(repo, script))
    os.chmod(os.path.join(repo, "install.sh"), 0o755)

    with open(os.path.join(repo, "skills", "skill-a", "SKILL.md"), "w", newline="\n") as f:
        f.write("---\nname: skill-a\ndescription: fake skill-a for install.sh tests\n---\ncontent\n")
    with open(os.path.join(repo, "skills", "skill-b", "SKILL.md"), "w", newline="\n") as f:
        f.write("---\nname: skill-b\ndescription: fake skill-b for install.sh tests\n"
                "disable-model-invocation: true\n---\ncontent\n")
    return repo


class InstallerTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="skilled-install-test-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.repo = build_fake_repo(self.tmp)

    def run_install(self, project, *args, check=False, env=None):
        result = subprocess.run(
            [sys.executable, os.path.join(self.repo, "install.py"), project, *args],
            capture_output=True,
            text=True,
            env=env,
        )
        if check and result.returncode != 0:
            self.fail(f"install.py {args} failed:\n{result.stdout}\n{result.stderr}")
        return result

    def manifest(self, project):
        with open(os.path.join(project, ".skilled-install.json")) as f:
            return json.load(f)["entries"]

    def new_project(self, name="proj"):
        path = os.path.join(self.tmp, name)
        os.makedirs(path, exist_ok=True)
        return path


class TestOwnershipConflicts(InstallerTestCase):
    """A project's own files, colliding by name with something skilled would
    install, must never be silently overwritten or deleted."""

    def test_same_name_custom_vendored_skill_survives_install(self):
        project = self.new_project()
        skill_dir = os.path.join(project, ".claude", "skills", "skill-a")
        os.makedirs(skill_dir)
        with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
            f.write("---\nname: skill-a\ndescription: my own custom skill-a\n---\nMY OWN CUSTOM CONTENT\n")
        with open(os.path.join(skill_dir, "my-notes.md"), "w") as f:
            f.write("extra file only I own\n")

        self.run_install(project, "--claude", "--vendor")

        with open(os.path.join(skill_dir, "SKILL.md")) as f:
            self.assertIn("MY OWN CUSTOM CONTENT", f.read())
        self.assertTrue(os.path.exists(os.path.join(skill_dir, "my-notes.md")))

    @needs_symlinks
    def test_legacy_pre_manifest_symlink_is_adopted_without_conflict(self):
        project = self.new_project()
        skills_dir = os.path.join(project, ".claude", "skills")
        os.makedirs(skills_dir)
        os.symlink(os.path.join(self.repo, "skills", "skill-a"), os.path.join(skills_dir, "skill-a"))

        result = self.run_install(project, "--claude", check=True)
        self.assertNotIn("conflict", result.stdout + result.stderr)

        self.assertIn(".claude/skills/skill-a", self.manifest(project))


class TestUninstall(InstallerTestCase):
    def test_bare_uninstall_after_vendor_install_removes_everything(self):
        project = self.new_project()
        self.run_install(project, "--claude", "--vendor", check=True)
        self.assertEqual(len(os.listdir(os.path.join(project, ".claude", "skills"))), 2)

        self.run_install(project, "--claude", "--uninstall", check=True)
        remaining = os.listdir(os.path.join(project, ".claude", "skills")) if os.path.exists(
            os.path.join(project, ".claude", "skills")
        ) else []
        self.assertEqual(remaining, [])

    def test_full_round_trip_symlink_mode_leaves_nothing_behind(self):
        project = self.new_project()
        self.run_install(project, check=True)
        self.run_install(project, check=True)  # reinstall must be idempotent, no conflicts
        self.run_install(project, "--uninstall", check=True)
        self.assertEqual(os.listdir(project), [], "uninstall must leave the project as it found it")

    def test_modified_vendored_skill_is_left_in_place_on_uninstall(self):
        project = self.new_project()
        self.run_install(project, "--claude", "--vendor", check=True)
        skill_md = os.path.join(project, ".claude", "skills", "skill-a", "SKILL.md")
        with open(skill_md, "a") as f:
            f.write("user added a line after install\n")

        result = self.run_install(project, "--claude", "--uninstall", check=True)
        self.assertIn("changed since skilled installed it", result.stdout + result.stderr)
        self.assertTrue(os.path.exists(skill_md))


class TestModeConversion(InstallerTestCase):
    @needs_symlinks
    def test_symlink_to_vendor_does_not_corrupt_repo_source(self):
        project = self.new_project()
        self.run_install(project, "--claude", check=True)

        self.run_install(project, "--claude", "--vendor", check=True)

        with open(os.path.join(self.repo, "skills", "skill-a", "SKILL.md")) as f:
            self.assertEqual(f.read(), "---\nname: skill-a\ndescription: fake skill-a for install.sh tests\n---\ncontent\n")
        skill_a_dest = os.path.join(project, ".claude", "skills", "skill-a")
        self.assertFalse(os.path.islink(skill_a_dest))
        self.assertTrue(os.path.isdir(skill_a_dest))

    @needs_symlinks
    def test_vendor_to_symlink_produces_clean_link_not_nested(self):
        project = self.new_project()
        self.run_install(project, "--claude", "--vendor", check=True)

        self.run_install(project, "--claude", check=True)

        skill_a_dest = os.path.join(project, ".claude", "skills", "skill-a")
        self.assertTrue(os.path.islink(skill_a_dest))
        self.assertEqual(installer_lib.readlink(skill_a_dest), os.path.join(self.repo, "skills", "skill-a"))


class TestPreflight(InstallerTestCase):
    def test_malformed_opencode_json_aborts_before_any_mutation(self):
        project = self.new_project()
        with open(os.path.join(project, "opencode.json"), "w") as f:
            f.write("{ this is not valid json")

        result = self.run_install(project, "--claude", "--opencode")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(os.path.exists(os.path.join(project, ".claude", "skills")))

    def test_wrong_type_skills_paths_is_refused(self):
        project = self.new_project()
        with open(os.path.join(project, "opencode.json"), "w") as f:
            json.dump({"skills": {"paths": "not-a-list"}}, f)

        result = self.run_install(project, "--opencode")
        self.assertNotEqual(result.returncode, 0)


class TestCliArgs(InstallerTestCase):
    def test_unknown_flag_rejected(self):
        project = self.new_project()
        result = self.run_install(project, "--project")
        self.assertNotEqual(result.returncode, 0)

    def test_extra_positional_argument_rejected(self):
        project = self.new_project()
        result = self.run_install(project, project)
        self.assertNotEqual(result.returncode, 0)


class TestNewTargets(InstallerTestCase):
    def test_model_only_skips_user_invoked(self):
        project = self.new_project()
        self.run_install(project, "--claude", "--vendor", "--model-only", check=True)
        self.assertEqual(os.listdir(os.path.join(project, ".claude", "skills")), ["skill-a"])

    def test_switching_to_model_only_prunes_unmodified_user_invoked(self):
        project = self.new_project()
        self.run_install(project, "--claude", "--vendor", check=True)
        self.run_install(project, "--claude", "--vendor", "--model-only", check=True)
        self.assertEqual(os.listdir(os.path.join(project, ".claude", "skills")), ["skill-a"])
        self.assertNotIn(".claude/skills/skill-b", self.manifest(project))

    def test_codex_and_dsh_use_agents_dir_without_antigravity_json(self):
        for flag in ("--codex", "--dsh"):
            project = self.new_project(flag.strip("-"))
            self.run_install(project, flag, "--vendor", check=True)
            self.assertEqual(sorted(os.listdir(os.path.join(project, ".agents", "skills"))),
                             ["skill-a", "skill-b"])
            self.assertFalse(os.path.exists(os.path.join(project, ".agents", "skills.json")))
            self.assertFalse(os.path.exists(os.path.join(project, ".claude")))
            self.run_install(project, flag, "--uninstall", check=True)
            self.assertFalse(os.path.exists(os.path.join(project, ".skilled-install.json")))

    def test_symlink_fallback_copies_and_round_trips(self):
        project = self.new_project()
        env = dict(os.environ, SKILLED_NO_SYMLINKS="1")
        result = self.run_install(project, "--claude", check=True, env=env)
        self.assertIn("copied instead", result.stdout)
        dest = os.path.join(project, ".claude", "skills", "skill-a")
        self.assertTrue(os.path.isdir(dest) and not os.path.islink(dest))
        self.assertEqual(self.manifest(project)[".claude/skills/skill-a"]["kind"], "vendor-dir")
        self.run_install(project, "--claude", check=True, env=env)  # idempotent
        self.run_install(project, "--claude", "--uninstall", check=True, env=env)
        self.assertEqual(os.listdir(project), [])


@unittest.skipIf(os.name == "nt", "install.sh is the POSIX wrapper")
class TestShellWrapper(InstallerTestCase):
    def test_install_sh_forwards_to_install_py(self):
        project = self.new_project()
        result = subprocess.run([os.path.join(self.repo, "install.sh"), project, "--claude", "--vendor"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(".claude/skills/skill-a", self.manifest(project))


if __name__ == "__main__":
    unittest.main()
