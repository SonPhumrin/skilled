#!/usr/bin/env python3
"""Regression tests for the git-guardrails PreToolUse hook script.

Each case here reproduces a confirmed bypass or false positive from the
external audit of this repo (raw substring `grep -E` over the whole command
string both missed real invocations and blocked harmless ones) and asserts
the patched, tokenized version gets it right.
"""
import json
import os
import subprocess
import unittest

SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "skills", "git-guardrails", "scripts", "block-dangerous-git.sh",
)


def run(command):
    payload = json.dumps({"tool_input": {"command": command}})
    result = subprocess.run(["bash", SCRIPT], input=payload, capture_output=True, text=True)
    return result.returncode, result.stderr


class TestMustBlock(unittest.TestCase):
    def assert_blocked(self, command):
        code, stderr = run(command)
        self.assertEqual(code, 2, f"expected block for {command!r}, got exit {code}: {stderr}")

    def test_plain_push(self):
        self.assert_blocked("git push origin main")

    def test_push_with_dash_c_prefix_previously_bypassed(self):
        self.assert_blocked("git -C . push origin main")

    def test_clean_df_flag_order_previously_bypassed(self):
        self.assert_blocked("git clean -df")

    def test_clean_f(self):
        self.assert_blocked("git clean -f")

    def test_reset_hard(self):
        self.assert_blocked("git reset --hard HEAD~1")

    def test_branch_delete_force(self):
        self.assert_blocked("git branch -D feature")

    def test_checkout_dot(self):
        self.assert_blocked("git checkout .")

    def test_restore_dot(self):
        self.assert_blocked("git restore .")

    def test_chained_command(self):
        self.assert_blocked("echo hi && git push")

    def test_malformed_json_fails_closed(self):
        result = subprocess.run(["bash", SCRIPT], input="not valid json", capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)


class TestMustAllow(unittest.TestCase):
    def assert_allowed(self, command):
        code, stderr = run(command)
        self.assertEqual(code, 0, f"expected allow for {command!r}, got exit {code}: {stderr}")

    def test_status(self):
        self.assert_allowed("git status")

    def test_clean_without_force(self):
        self.assert_allowed("git clean -d")

    def test_checkout_patch_mode_is_safe(self):
        self.assert_allowed("git checkout -p .")

    def test_text_merely_mentioning_git_push_previously_false_positive(self):
        self.assert_allowed("echo 'please dont git push this'")

    def test_commit_message_mentioning_git_push(self):
        self.assert_allowed("git commit -m 'about git push handling'")

    def test_log(self):
        self.assert_allowed("git log --oneline")


if __name__ == "__main__":
    unittest.main()
