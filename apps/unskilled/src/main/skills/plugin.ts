import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Catalog } from "./catalog";

export const PLUGIN_NAME = "skilled";

/**
 * Skill bodies call each other as `Call the Skill tool with "tdd"`. Inside a
 * plugin, Claude Code names skills `skilled:tdd`, so every quoted skill name
 * on a line that mentions the Skill tool is qualified. Only names in
 * `known` are touched, so ordinary quoted text is left alone.
 */
export function qualifySkillCalls(text: string, known: Set<string>, prefix = `${PLUGIN_NAME}:`): string {
  if (!prefix) return text;
  return text
    .split("\n")
    .map((line) => {
      if (!/Skill tool/.test(line)) return line;
      return line.replace(/(["`])([a-z0-9-]+)\1/g, (match, quote: string, name: string) =>
        known.has(name) ? `${quote}${prefix}${name}${quote}` : match,
      );
    })
    .join("\n");
}

function rewriteMarkdown(dir: string, known: Set<string>): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      rewriteMarkdown(full, known);
    } else if (entry.endsWith(".md")) {
      const text = readFileSync(full, "utf-8");
      const next = qualifySkillCalls(text, known);
      if (next !== text) writeFileSync(full, next);
    }
  }
}

/**
 * Build the local Claude Code plugin that carries skilled's model-invoked
 * skills. Only those go to the agent: the user-invoked ones are served from
 * the app's own / menu (HARNESS.md), so they never cost context.
 *
 * Rebuilt only when the catalog changes (keyed by the skills' fingerprints),
 * so starting a turn stays cheap.
 */
export function ensurePlugin(catalog: Catalog, targetDir: string): string {
  const stamp = catalog.modelSkills.map((s) => `${s.name}:${s.sha256}`).join("\n");
  const stampFile = join(targetDir, ".stamp");
  if (existsSync(stampFile) && readFileSync(stampFile, "utf-8") === stamp) return targetDir;

  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(join(targetDir, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(targetDir, ".claude-plugin", "plugin.json"),
    JSON.stringify(
      {
        name: PLUGIN_NAME,
        description: "skilled's model-invoked skills, loaded by UnSkilled.",
        version: "1.0.0",
      },
      null,
      2,
    ) + "\n",
  );

  const known = new Set(catalog.modelSkills.map((s) => s.name));
  for (const skill of catalog.modelSkills) {
    const dest = join(targetDir, "skills", skill.name);
    cpSync(join(catalog.root.skillsDir, skill.name), dest, { recursive: true });
    rewriteMarkdown(dest, known);
  }
  writeFileSync(stampFile, stamp);
  return targetDir;
}

/**
 * A plain copy of the model-invoked skills, names unqualified, for agents
 * that load skills from a directory (deepseek-harness's
 * DSH_BUNDLED_SKILL_DIR). Rebuilt only when the catalog changes.
 */
export function ensureModelSkillsDir(catalog: Catalog, targetDir: string): string {
  const stamp = catalog.modelSkills.map((s) => `${s.name}:${s.sha256}`).join("\n");
  const stampFile = join(targetDir, ".stamp");
  if (existsSync(stampFile) && readFileSync(stampFile, "utf-8") === stamp) return targetDir;
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  for (const skill of catalog.modelSkills) {
    cpSync(join(catalog.root.skillsDir, skill.name), join(targetDir, skill.name), { recursive: true });
  }
  writeFileSync(stampFile, stamp);
  return targetDir;
}
