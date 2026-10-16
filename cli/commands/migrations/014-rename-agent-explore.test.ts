import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { migrateRenameAgentExplore } from "./014-rename-agent-explore.js";

function makeWorkspace(configYaml?: string): string {
  const cwd = mkdtempSync(join(tmpdir(), "oma-014-test-"));
  if (configYaml !== undefined) {
    mkdirSync(join(cwd, ".agents"), { recursive: true });
    writeFileSync(join(cwd, ".agents", "oma-config.yaml"), configYaml, "utf-8");
  }
  return cwd;
}

function readConfig(cwd: string): string {
  return readFileSync(join(cwd, ".agents", "oma-config.yaml"), "utf-8");
}

describe("migration 014 — rename agent id retrieval → explore", () => {
  let legacyConfig: string;

  beforeEach(() => {
    legacyConfig = [
      "language: en",
      "model_preset: claude",
      "agents:",
      "  retrieval: # keep my comment",
      "    model: google/gemini-3.1-flash-lite",
      "custom_presets:",
      "  my-preset:",
      "    extends: claude",
      "    agent_defaults:",
      "      retrieval:",
      "        model: google/gemini-3.1-flash-lite",
      "",
    ].join("\n");
  });

  it("renames agents and custom_presets keys, preserving comments", () => {
    const cwd = makeWorkspace(legacyConfig);
    const actions = migrateRenameAgentExplore.up(cwd);

    const content = readConfig(cwd);
    expect(content).toContain("  explore: # keep my comment");
    expect(content).toContain("      explore:");
    expect(content).not.toMatch(/^\s+retrieval:/m);
    expect(actions.some((a) => a.includes('"retrieval" → "explore"'))).toBe(
      true,
    );
  });

  it("is idempotent — second run is a no-op", () => {
    const cwd = makeWorkspace(legacyConfig);
    migrateRenameAgentExplore.up(cwd);
    const after = readConfig(cwd);

    const actions = migrateRenameAgentExplore.up(cwd);
    expect(actions).toEqual([]);
    expect(readConfig(cwd)).toBe(after);
  });

  it("skips configs without a legacy key", () => {
    const cwd = makeWorkspace(
      "language: en\nmodel_preset: claude\nagents:\n  explore:\n    model: google/gemini-3.1-flash-lite\n",
    );
    const actions = migrateRenameAgentExplore.up(cwd);
    expect(actions).toEqual([]);
  });

  it("skips when oma-config.yaml is absent", () => {
    const cwd = makeWorkspace(undefined);
    expect(migrateRenameAgentExplore.up(cwd)).toEqual([]);
  });

  it("writes a backup before rewriting", () => {
    const cwd = makeWorkspace(legacyConfig);
    const actions = migrateRenameAgentExplore.up(cwd);
    expect(actions.some((a) => a.includes("Backed up"))).toBe(true);
    const backup = readFileSync(
      join(
        cwd,
        ".agents",
        "backup",
        "014-rename-agent-explore",
        "oma-config.yaml",
      ),
      "utf-8",
    );
    expect(backup).toContain("  retrieval: # keep my comment");
  });
});
