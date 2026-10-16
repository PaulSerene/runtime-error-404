import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../../utils/frontmatter.js";

export function classifyUpdateTarget(
  localVersion: string | null,
  hasExistingInstall: boolean,
): "ready" | "legacy" | "missing" {
  if (localVersion !== null) return "ready";
  return hasExistingInstall ? "legacy" : "missing";
}

/**
 * Collect skill names referenced by agent definitions (`skills:` frontmatter
 * in `.agents/agents/*.md`). Agents are never pruned on update, so the skills
 * they depend on must not be pruned either — otherwise an update can deliver
 * an agent whose skill is missing (a dangling agent).
 *
 * Read AFTER the bulk `.agents` copy so newly shipped agents count.
 */
export function collectAgentRequiredSkills(cwd: string): string[] {
  const agentsDir = join(cwd, ".agents", "agents");
  if (!existsSync(agentsDir)) return [];

  const required = new Set<string>();
  let files: string[];
  try {
    files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  for (const file of files) {
    try {
      const { frontmatter } = parseFrontmatter(
        readFileSync(join(agentsDir, file), "utf-8"),
      );
      const skills = frontmatter.skills;
      if (Array.isArray(skills)) {
        for (const s of skills) {
          if (typeof s === "string" && s.length > 0) required.add(s);
        }
      }
    } catch {
      // unreadable agent file — skip; link/install will surface it elsewhere
    }
  }
  return [...required].sort();
}

/**
 * Decide which freshly-copied skills to prune after the bulk `.agents` copy.
 *
 * An update overwrites the whole `.agents` tree with the release, which drops
 * in every skill the release ships. To preserve the selection the user made at
 * install time, we prune skills that are new in the release and were not already
 * present — unless the user opts into them with `--with-new-skills`.
 *
 * Skills referenced by shipped agents are never pruned (see
 * `collectAgentRequiredSkills`): an agent without its skill is a broken
 * deliverable, not a selection choice.
 *
 * @param installedBefore skill dirs present before the copy (the user's selection)
 * @param installedAfter  skill dirs present after the copy (the full release set)
 * @param withNewSkills   when true, keep new skills instead of pruning them
 * @param requiredSkills  skill names that must never be pruned (agent dependencies)
 * @returns skill names to remove (sorted): new in the release and not opted in
 */
export function selectSkillsToPrune(
  installedBefore: string[],
  installedAfter: string[],
  withNewSkills: boolean,
  requiredSkills: Iterable<string> = [],
): string[] {
  if (withNewSkills) return [];
  const kept = new Set(installedBefore);
  const required = new Set(requiredSkills);
  return installedAfter
    .filter(
      (name) =>
        name.startsWith("oma-") && !kept.has(name) && !required.has(name),
    )
    .sort();
}
