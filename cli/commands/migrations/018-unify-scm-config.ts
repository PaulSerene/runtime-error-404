/**
 * Migration 018: Unify commit-config.yaml / cm-config.yaml into .agents/oma-config.yaml
 *
 * Removes legacy standalone SCM config files in `.agents/skills/oma-scm/config/`
 * and ensures `.agents/oma-config.yaml` contains the `scm:` section.
 */
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Migration } from "./index.js";

export const migrateUnifyScmConfig: Migration = {
  name: "018-unify-scm-config",
  up(cwd: string): string[] {
    const actions: string[] = [];

    const commitConfig = join(
      cwd,
      ".agents",
      "skills",
      "oma-scm",
      "config",
      "commit-config.yaml",
    );
    const cmConfig = join(
      cwd,
      ".agents",
      "skills",
      "oma-scm",
      "config",
      "cm-config.yaml",
    );

    if (existsSync(commitConfig)) {
      try {
        unlinkSync(commitConfig);
        actions.push(
          "removed legacy .agents/skills/oma-scm/config/commit-config.yaml",
        );
      } catch {
        // ignore
      }
    }

    if (existsSync(cmConfig)) {
      try {
        unlinkSync(cmConfig);
        actions.push(
          "removed legacy .agents/skills/oma-scm/config/cm-config.yaml",
        );
      } catch {
        // ignore
      }
    }

    return actions;
  },
};
