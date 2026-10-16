// Regression tests for path-traversal fixes in visual-shared helpers.
// Covers findings:
//   HIGH path-traversal – writePlaceholder writes outside run dir (visual-shared.ts L21)
//   HIGH path-traversal – ingestVisual copies outside run dir  (visual-shared.ts L50)
//   HIGH path-traversal – Pexels download writes outside run dir (via sanitizeSceneId)
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ingestVisual,
  sanitizeSceneId,
  writePlaceholder,
} from "./visual-shared.js";

// Minimal Scene fixture with a traversal-capable id.
function makeScene(id: string) {
  return {
    id,
    durationSec: 5,
    narration: "test narration",
    onScreenText: ["test"],
    visual: {
      kind: "still" as const,
      prompt: "test prompt",
    },
    transition: "none",
  };
}

describe("sanitizeSceneId", () => {
  it("passes through safe ids unchanged", () => {
    expect(sanitizeSceneId("scene-01")).toBe("scene-01");
    expect(sanitizeSceneId("scene_02")).toBe("scene_02");
    expect(sanitizeSceneId("abc123")).toBe("abc123");
  });

  it("replaces path separators with underscores", () => {
    // Each disallowed char (. . /) maps to one underscore.
    expect(sanitizeSceneId("../escape")).toBe("___escape");
    expect(sanitizeSceneId("../../etc/passwd")).toBe("______etc_passwd");
    expect(sanitizeSceneId("foo/bar")).toBe("foo_bar");
  });

  it("replaces absolute path prefix characters", () => {
    // On POSIX an id starting with '/' would resolve to an absolute path
    expect(sanitizeSceneId("/etc/shadow")).toBe("_etc_shadow");
  });

  it("replaces dots that are part of traversal sequences", () => {
    expect(sanitizeSceneId("..")).toBe("__");
    expect(sanitizeSceneId("../..")).toBe("_____");
  });

  it("replaces spaces and special characters", () => {
    expect(sanitizeSceneId("my scene!")).toBe("my_scene_");
    expect(sanitizeSceneId("scene:colon")).toBe("scene_colon");
  });
});

describe("writePlaceholder — path traversal containment", () => {
  let runDir: string;

  beforeEach(() => {
    runDir = mkdtempSync(path.join(os.tmpdir(), "oma-visual-test-"));
  });

  afterEach(() => {
    rmSync(runDir, { recursive: true, force: true });
  });

  it("does NOT write outside runDir when scene.id contains path traversal", async () => {
    const traversalId = "../../evil";
    const scene = makeScene(traversalId);
    const opts = { runDir, seed: 1 };

    const asset = await writePlaceholder(scene, opts, "test-provider");

    // The returned path must not escape the run dir.
    const absWritten = path.resolve(runDir, asset.path);
    expect(absWritten.startsWith(runDir + path.sep)).toBe(true);

    // The file must exist inside runDir.
    expect(existsSync(absWritten)).toBe(true);

    // sceneId on the asset is preserved (for downstream reference) but the
    // file path is safe.
    expect(asset.sceneId).toBe(traversalId);
    expect(asset.path).not.toContain("..");
  });

  it("writes correctly for a normal safe id", async () => {
    const scene = makeScene("scene-01");
    const opts = { runDir, seed: 42 };

    const asset = await writePlaceholder(scene, opts, "oma-image");

    const absWritten = path.resolve(runDir, asset.path);
    expect(absWritten.startsWith(runDir + path.sep)).toBe(true);
    expect(existsSync(absWritten)).toBe(true);
    expect(asset.path).toBe(path.join("visuals", "scene-01-placeholder.svg"));
  });
});

describe("ingestVisual — path traversal containment", () => {
  let runDir: string;
  let sourceFile: string;

  beforeEach(() => {
    runDir = mkdtempSync(path.join(os.tmpdir(), "oma-visual-test-"));
    // Create a dummy source file to copy.
    sourceFile = path.join(runDir, "dummy.png");
    writeFileSync(sourceFile, "PNG_DUMMY");
  });

  afterEach(() => {
    rmSync(runDir, { recursive: true, force: true });
  });

  it("does NOT copy outside runDir when scene.id contains path traversal", async () => {
    const traversalId = "../../../tmp/owned";
    const scene = makeScene(traversalId);

    const asset = await ingestVisual(
      scene,
      runDir,
      sourceFile,
      "image",
      "oma-image",
    );

    // The returned path must be contained within runDir.
    const absDest = path.resolve(runDir, asset.path);
    expect(absDest.startsWith(runDir + path.sep)).toBe(true);

    // The file must exist inside runDir.
    expect(existsSync(absDest)).toBe(true);

    // sceneId is preserved for manifest tracking.
    expect(asset.sceneId).toBe(traversalId);
    expect(asset.path).not.toContain("..");
  });

  it("copies correctly for a normal safe id", async () => {
    const scene = makeScene("scene-02");

    const asset = await ingestVisual(
      scene,
      runDir,
      sourceFile,
      "image",
      "oma-image",
    );

    const absDest = path.resolve(runDir, asset.path);
    expect(absDest.startsWith(runDir + path.sep)).toBe(true);
    expect(existsSync(absDest)).toBe(true);
    expect(asset.path).toBe(path.join("visuals", "scene-02-oma-image.png"));
  });
});

describe("Pexels download path construction — sanitizeSceneId used in rel", () => {
  // The PexelsVisualProvider.download() method is private; we test the
  // sanitization primitive it now delegates to directly, asserting that
  // path.join("visuals", `${sanitizeSceneId(id)}-pexels.mp4`) stays flat.
  it("traversal id does not escape the visuals/ prefix when used in path.join", () => {
    const traversalId = "../../pwn";
    const safeId = sanitizeSceneId(traversalId);
    const rel = path.join("visuals", `${safeId}-pexels.mp4`);

    // Must start with 'visuals/' and not contain any '..' segments.
    expect(rel.startsWith("visuals")).toBe(true);
    expect(rel).not.toContain("..");
  });
});
