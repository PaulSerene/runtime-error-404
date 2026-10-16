import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateUnifyScmConfig } from "./018-unify-scm-config.js";

describe("migration 018: unify scm config", () => {
  it("removes legacy standalone commit-config.yaml and cm-config.yaml if present", () => {
    const tmpDir = join(process.cwd(), "node_modules", ".cache", "test-018");
    const skillConfigDir = join(
      tmpDir,
      ".agents",
      "skills",
      "oma-scm",
      "config",
    );
    mkdirSync(skillConfigDir, { recursive: true });

    const legacyCommitConfig = join(skillConfigDir, "commit-config.yaml");
    const legacyCmConfig = join(skillConfigDir, "cm-config.yaml");

    writeFileSync(legacyCommitConfig, "conventional_commits: true\n");
    writeFileSync(legacyCmConfig, "branching_strategy: github-flow\n");

    expect(existsSync(legacyCommitConfig)).toBe(true);
    expect(existsSync(legacyCmConfig)).toBe(true);

    const actions = migrateUnifyScmConfig.up(tmpDir);

    expect(actions).toHaveLength(2);
    expect(existsSync(legacyCommitConfig)).toBe(false);
    expect(existsSync(legacyCmConfig)).toBe(false);
  });
});
