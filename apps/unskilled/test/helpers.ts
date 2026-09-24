import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach } from "vitest";
import { findSkillsRoot, loadCatalog } from "../src/main/skills/catalog";

/** The monorepo's real skills library. */
export const repoRoot = resolve(__dirname, "..", "..", "..");
export const catalog = () => loadCatalog(findSkillsRoot([repoRoot]));

const dirs: string[] = [];
export function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "unskilled-test-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
