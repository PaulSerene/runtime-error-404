/**
 * Migration 014: Rename the `retrieval` agent id to `explore` in
 * oma-config.yaml (`agents:` overrides and `custom_presets.*.agent_defaults`).
 *
 * The canonical AgentId was renamed retrieval -> explore; the strict config
 * schema accepts only the canonical key, so legacy configs are rewritten
 * in place. Line-level replacement preserves comments and formatting:
 * `retrieval` only ever appears as a mapping key in agent contexts, so an
 * indented-key rewrite is safe.
 *
 * Idempotent: skips when no indented `retrieval:` key is present.
 * Backs up oma-config.yaml into `.agents/backup/014-rename-agent-explore/`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { backupPathFromRoot } from "../../io/backup.js";
import type { Migration } from "./index.js";

const LEGACY_KEY_LINE = /^(\s+)retrieval(:.*)$/m;
const LEGACY_KEY_LINE_ALL = /^(\s+)retrieval(:.*)$/gm;

export const migrateRenameAgentExplore: Migration = {
  name: "014-rename-agent-explore",
  up(cwd: string): string[] {
    const actions: string[] = [];
    const omaConfigPath = join(cwd, ".agents", "oma-config.yaml");

    if (!existsSync(omaConfigPath)) {
      return actions;
    }

    let content: string;
    try {
      content = readFileSync(omaConfigPath, "utf-8");
    } catch {
      return actions;
    }

    // Idempotency: nothing to do when no legacy key remains
    if (!LEGACY_KEY_LINE.test(content)) {
      return actions;
    }

    // Back up before writing
    const backupPath = backupPathFromRoot(
      cwd,
      "014-rename-agent-explore",
      "oma-config.yaml",
    );
    try {
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(omaConfigPath, backupPath);
      actions.push(
        `Backed up .agents/oma-config.yaml → .agents/backup/014-rename-agent-explore/oma-config.yaml`,
      );
    } catch {
      // best-effort backup; proceed with rename anyway
    }

    const newContent = content.replace(
      LEGACY_KEY_LINE_ALL,
      (_full, indent, rest) => `${indent}explore${rest}`,
    );

    writeFileSync(omaConfigPath, newContent, "utf-8");
    actions.push(
      `.agents/oma-config.yaml: agent id "retrieval" → "explore" (agents/custom_presets keys)`,
    );

    return actions;
  },
};
