import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasSessionResultArtifact } from "./spawn-status.js";

// Real-fs coverage for the agy misplaced-write guard (tech-debt #7).
// spawn-status.test.ts mocks node:fs entirely, so this lives in its own file.
describe("hasSessionResultArtifact", () => {
  const workspaces: string[] = [];
  const makeWorkspace = () => {
    const ws = mkdtempSync(join(tmpdir(), "oma-artifact-guard-"));
    workspaces.push(ws);
    return ws;
  };

  afterEach(() => {
    for (const ws of workspaces.splice(0)) {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("returns false for an empty workspace", () => {
    const ws = makeWorkspace();
    expect(hasSessionResultArtifact(ws, "session-x", 0)).toBe(false);
  });

  it("finds a fresh session result under .agents/results", () => {
    const ws = makeWorkspace();
    const dir = join(ws, ".agents", "results");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "result-docs-T1-session-x.md"),
      "## Status: completed\n",
    );
    expect(hasSessionResultArtifact(ws, "session-x", Date.now() - 60_000)).toBe(
      true,
    );
  });

  it("finds a fresh session result under the memories dir", () => {
    const ws = makeWorkspace();
    const dir = join(ws, ".agents", "state", "memories");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "result-qa-session-x.md"), "x");
    expect(hasSessionResultArtifact(ws, "session-x", Date.now() - 60_000)).toBe(
      true,
    );
  });

  it("ignores artifacts older than sinceMs (stale from a previous task)", () => {
    const ws = makeWorkspace();
    const dir = join(ws, ".agents", "results");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "result-docs-T1-session-x.md");
    writeFileSync(file, "stale");
    const oldSeconds = (Date.now() - 3_600_000) / 1000;
    utimesSync(file, oldSeconds, oldSeconds);
    expect(hasSessionResultArtifact(ws, "session-x", Date.now() - 60_000)).toBe(
      false,
    );
  });

  it("ignores other sessions' artifacts and non-result files", () => {
    const ws = makeWorkspace();
    const dir = join(ws, ".agents", "results");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "result-docs-session-OTHER.md"), "x");
    writeFileSync(join(dir, "progress-docs-session-x.md"), "x");
    expect(hasSessionResultArtifact(ws, "session-x", 0)).toBe(false);
  });
});
