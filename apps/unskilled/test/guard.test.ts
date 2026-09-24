import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCommand, findPython } from "../src/main/guard";
import { repoRoot } from "./helpers";

const script = join(repoRoot, "skills", "git-guardrails", "scripts", "block-dangerous-git.py");

describe.skipIf(!findPython())("checkCommand", () => {
  it("blocks what skilled's git-guardrails blocks", async () => {
    const v = await checkCommand(script, "Bash", "git push origin main");
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/BLOCKED/);
  });

  it("allows ordinary commands", async () => {
    expect((await checkCommand(script, "Bash", "git status")).blocked).toBe(false);
  });
});
