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
import sys
import unittest

SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "skills", "git-guardrails", "scripts", "block-dangerous-git.py",
)


def run(command, tool_name="Bash"):
    # Claude Code sends tool_name "Bash"; deepseek-harness's Claude Code hooks
    # plugin sends "bash" (or "pwsh" on Windows). Same tool_input.command.
    payload = json.dumps({"tool_name": tool_name, "tool_input": {"command": command}})
    result = subprocess.run([sys.executable, SCRIPT], input=payload, capture_output=True, text=True)
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
        result = subprocess.run([sys.executable, SCRIPT], input="not valid json", capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)

    def test_dsh_style_payload(self):
        for tool_name in ("bash", "pwsh"):
            code, _ = run("git push", tool_name=tool_name)
            self.assertEqual(code, 2)

    def test_quoted_global_option_and_exe(self):
        self.assert_blocked('git -C "my repo" push')
        self.assert_blocked("git.exe push")

    def test_branch_delete_force_long_form(self):
        self.assert_blocked("git branch --delete --force feature")

    def test_destructive_database_and_infra(self):
        for command in (
            "terraform destroy -auto-approve",
            "terraform apply -destroy",
            "npx prisma migrate reset --force",
            "bin/rails db:drop",
            "bundle exec rake db:reset",
            "dropdb app_production",
            "docker volume rm app_data",
            "kubectl delete ns staging",
            'psql "$DATABASE_URL" -c "DROP TABLE users"',
            "mysql -e 'truncate table orders'",
        ):
            self.assert_blocked(command)


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

    def test_safe_database_and_infra(self):
        for command in (
            "terraform plan",
            "npx prisma migrate dev",
            "bin/rails db:migrate",
            "psql -c 'select * from users'",
            "grep -rn 'DROP TABLE' migrations/",
            "docker volume ls",
        ):
            self.assert_allowed(command)

    def test_missing_command_field(self):
        result = subprocess.run([sys.executable, SCRIPT], input=json.dumps({"tool_input": {}}),
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
