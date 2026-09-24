import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { SkillEntry } from "../../shared/types";

/**
 * The skilled library this app runs: `skills.json` plus the `skills/`
 * directory beside it. A packaged app ships a copy in its resources; in
 * development it is the monorepo root, two levels above apps/unskilled.
 */
export interface SkillsRoot {
  /** Directory holding skills.json. */
  dir: string;
  /** Directory holding one folder per skill. */
  skillsDir: string;
}

export function findSkillsRoot(candidates: string[]): SkillsRoot {
  for (const candidate of candidates) {
    const dir = resolve(candidate);
    if (existsSync(join(dir, "skills.json")) && existsSync(join(dir, "skills"))) {
      return { dir, skillsDir: join(dir, "skills") };
    }
  }
  throw new Error(`skills.json not found in any of: ${candidates.join(", ")}`);
}

/** Candidate locations, most specific first. */
export function defaultSkillsCandidates(opts: { resourcesPath?: string; appPath: string }): string[] {
  const list: string[] = [];
  if (process.env.UNSKILLED_SKILLS_DIR) list.push(process.env.UNSKILLED_SKILLS_DIR);
  if (opts.resourcesPath) list.push(join(opts.resourcesPath, "skilled"));
  // apps/unskilled -> repo root
  list.push(resolve(opts.appPath, "..", ".."));
  list.push(dirname(dirname(opts.appPath)));
  return list;
}

export interface Catalog {
  root: SkillsRoot;
  skills: SkillEntry[];
  byName: Map<string, SkillEntry>;
  modelSkills: SkillEntry[];
  userSkills: SkillEntry[];
}

export function loadCatalog(root: SkillsRoot): Catalog {
  const raw = JSON.parse(readFileSync(join(root.dir, "skills.json"), "utf-8")) as {
    version: number;
    skills: SkillEntry[];
  };
  if (raw.version !== 1 || !Array.isArray(raw.skills)) {
    throw new Error(`unsupported skills.json version ${String(raw.version)}`);
  }
  const skills = raw.skills;
  return {
    root,
    skills,
    byName: new Map(skills.map((s) => [s.name, s])),
    modelSkills: skills.filter((s) => s.invocation === "model"),
    userSkills: skills.filter((s) => s.invocation === "user"),
  };
}

/** SKILL.md without its frontmatter block. */
export function readSkillBody(root: SkillsRoot, name: string): string {
  const text = readFileSync(join(root.skillsDir, name, "SKILL.md"), "utf-8");
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return text;
  const end = lines.indexOf("---", 1);
  return end === -1 ? text : lines.slice(end + 1).join("\n").replace(/^\n+/, "");
}
