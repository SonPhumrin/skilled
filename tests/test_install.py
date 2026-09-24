#!/usr/bin/env python3
"""Regression tests for install.sh's ownership-manifest safety.

Runs install.sh against a small isolated fake "skilled repo" (a couple of
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
import tempfile
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build_fake_repo(root):
    """A minimal stand-in for the real skilled repo: 2 fake skills, this
    repo's real install.sh + installer_lib.py.
    Keeps tests fast and, critically, means a bug in a test can never touch
    this actual repo's real files."""
    repo = os.path.join(root, "fake-skilled-repo")
    os.makedirs(os.path.join(repo, "skills", "skill-a"))
    os.makedirs(os.path.join(repo, "skills", "skill-b"))

    shutil.copy(os.path.join(REPO_ROOT, "install.sh"), os.path.join(repo, "install.sh"))
    shutil.copy(os.path.join(REPO_ROOT, "installer_lib.py"), os.path.join(repo, "installer_lib.py"))
    os.chmod(os.path.join(repo, "install.sh"), 0o755)

    for name in ("skill-a", "skill-b"):
        with open(os.path.join(repo, "skills", name, "SKILL.md"), "w") as f:
            f.write(f"---\nname: {name}\ndescription: fake {name} for install.sh tests\n---\ncontent\n")
    return repo


class InstallerTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="skilled-install-test-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.repo = build_fake_repo(self.tmp)

    def run_install(self, project, *args, check=False):
        result = subprocess.run(
            [os.path.join(self.repo, "install.sh"), project, *args],
            capture_output=True,
            text=True,
        )
        if check and result.returncode != 0:
            self.fail(f"install.sh {args} failed:\n{result.stdout}\n{result.stderr}")
        return result

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

    def test_legacy_pre_manifest_symlink_is_adopted_without_conflict(self):
        project = self.new_project()
        skills_dir = os.path.join(project, ".claude", "skills")
        os.makedirs(skills_dir)
        os.symlink(os.path.join(self.repo, "skills", "skill-a"), os.path.join(skills_dir, "skill-a"))

        result = self.run_install(project, "--claude", check=True)
        self.assertNotIn("conflict", result.stdout + result.stderr)

        with open(os.path.join(project, ".skilled-install.json")) as f:
            manifest = json.load(f)
        self.assertIn(".claude/skills/skill-a", manifest["entries"])


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
        self.assertFalse(os.path.exists(os.path.join(project, ".skilled-install.json")))
        self.assertFalse(os.path.exists(os.path.join(project, "opencode.json")))

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
    def test_symlink_to_vendor_does_not_corrupt_repo_source(self):
        project = self.new_project()
        self.run_install(project, "--claude", check=True)

        self.run_install(project, "--claude", "--vendor", check=True)

        with open(os.path.join(self.repo, "skills", "skill-a", "SKILL.md")) as f:
            self.assertEqual(f.read(), "---\nname: skill-a\ndescription: fake skill-a for install.sh tests\n---\ncontent\n")
        skill_a_dest = os.path.join(project, ".claude", "skills", "skill-a")
        self.assertFalse(os.path.islink(skill_a_dest))
        self.assertTrue(os.path.isdir(skill_a_dest))

    def test_vendor_to_symlink_produces_clean_link_not_nested(self):
        project = self.new_project()
        self.run_install(project, "--claude", "--vendor", check=True)

        self.run_install(project, "--claude", check=True)

        skill_a_dest = os.path.join(project, ".claude", "skills", "skill-a")
        self.assertTrue(os.path.islink(skill_a_dest))
        self.assertEqual(os.readlink(skill_a_dest), os.path.join(self.repo, "skills", "skill-a"))


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


if __name__ == "__main__":
    unittest.main()
