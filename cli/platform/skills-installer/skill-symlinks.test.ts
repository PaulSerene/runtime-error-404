import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createVendorSymlinks } from "./skill-symlinks.js";

const CURSOR_SKILLS = ".cursor/skills";

function setupSsotSkill(root: string, name: string): string {
  const skillDir = join(root, ".agents", "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), `---\nname: ${name}\n---\n`);
  return skillDir;
}

function linkSkill(root: string, name: string): string {
  const linkRoot = join(root, CURSOR_SKILLS);
  mkdirSync(linkRoot, { recursive: true });
  const link = join(linkRoot, name);
  symlinkSync(
    relative(linkRoot, join(root, ".agents", "skills", name)),
    link,
    "dir",
  );
  return link;
}

describe("createVendorSymlinks (real fs)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "oma-skill-symlinks-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("creates a missing symlink", () => {
    setupSsotSkill(root, "oma-test");

    const result = createVendorSymlinks(root, ["cursor"], ["oma-test"]);

    expect(result.created).toContain(`${CURSOR_SKILLS}/oma-test`);
    const link = join(root, CURSOR_SKILLS, "oma-test");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it("keeps an already-correct symlink instead of recreating it", () => {
    setupSsotSkill(root, "oma-test");
    const link = linkSkill(root, "oma-test");
    const before = readlinkSync(link);

    const result = createVendorSymlinks(root, ["cursor"], ["oma-test"]);

    expect(result.created).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.skipped).toContain(
      `${CURSOR_SKILLS}/oma-test (already linked)`,
    );
    expect(readlinkSync(link)).toBe(before);
  });

  it("prunes dangling symlinks (e.g. legacy skill names after a rename)", () => {
    setupSsotSkill(root, "oma-backend");
    // Legacy link whose SSOT target no longer exists
    const dangling = linkSkill(root, "backend-agent");

    const result = createVendorSymlinks(root, ["cursor"], ["oma-backend"]);

    expect(result.removed).toContain(`${CURSOR_SKILLS}/backend-agent`);
    expect(existsSync(dangling)).toBe(false);
    expect(lstatSync(join(root, CURSOR_SKILLS, "oma-backend"))).toBeDefined();
  });

  it("never touches real directories or live foreign symlinks", () => {
    setupSsotSkill(root, "oma-test");

    // Workflow-style real dir with a SKILL.md inside
    const workflowDir = join(root, CURSOR_SKILLS, "work");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, "SKILL.md"), "---\nname: work\n---\n");

    // User-authored symlink pointing at a live target outside SSOT
    const userTarget = join(root, "my-skill");
    mkdirSync(userTarget, { recursive: true });
    const userLink = join(root, CURSOR_SKILLS, "my-skill");
    symlinkSync(userTarget, userLink, "dir");

    const result = createVendorSymlinks(root, ["cursor"], ["oma-test"]);

    expect(result.removed).toHaveLength(0);
    expect(existsSync(join(workflowDir, "SKILL.md"))).toBe(true);
    expect(lstatSync(userLink).isSymbolicLink()).toBe(true);
  });
});
