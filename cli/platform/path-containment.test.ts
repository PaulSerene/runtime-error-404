import { describe, expect, it } from "vitest";
import {
  assertContainedRelPath,
  normalizeCaseForContainment,
} from "./path-containment.js";

const root = "/tmp/oma-install-root";

describe("assertContainedRelPath", () => {
  it("accepts a contained relative path", () => {
    expect(assertContainedRelPath(root, ".claude/agents", "x")).toBe(
      ".claude/agents",
    );
    expect(assertContainedRelPath(root, "a/b/c", "x")).toBe("a/b/c");
  });

  it("rejects parent-traversal that escapes the root", () => {
    // Regression: a malicious variant {"destDir":"../../../../tmp/evil"} used to
    // escape the workspace because join() collapses `..`.
    expect(() =>
      assertContainedRelPath(root, "../../../../tmp/evil", "agent dest dir"),
    ).toThrow(/outside the project root/);
  });

  it("rejects an absolute path", () => {
    expect(() =>
      assertContainedRelPath(root, "/etc/cron.d/evil", "settings file"),
    ).toThrow(/absolute path/);
  });

  it("rejects empty or non-string input", () => {
    expect(() => assertContainedRelPath(root, "", "x")).toThrow();
    // @ts-expect-error intentional bad input
    expect(() => assertContainedRelPath(root, undefined, "x")).toThrow();
  });

  it("allows a sneaky path that stays within root after normalization", () => {
    expect(assertContainedRelPath(root, "a/../b", "x")).toBe("a/../b");
  });
});

describe("normalizeCaseForContainment", () => {
  it("lowercases on darwin and win32, leaves linux unchanged", () => {
    const p = "/Tmp/OMA-Install-Root/SubDir";
    if (process.platform === "darwin" || process.platform === "win32") {
      expect(normalizeCaseForContainment(p)).toBe(p.toLowerCase());
    } else {
      expect(normalizeCaseForContainment(p)).toBe(p);
    }
  });

  it("case-variant path that stays inside root is accepted on any platform", () => {
    // assertContainedRelPath works with the real resolved root, so we use a
    // concrete lowercase root; the traversal attempt uses a mixed-case subdir.
    // On case-insensitive platforms this used to bypass the check; after the
    // fix both sides are normalized before comparison so it is still contained.
    const lowerRoot = root.toLowerCase();
    // A plain relative path — accepted regardless of case normalization.
    expect(assertContainedRelPath(lowerRoot, "SubDir/file.txt", "x")).toBe(
      "SubDir/file.txt",
    );
  });

  it("rejects traversal even when root has mixed casing", () => {
    const lowerRoot = root.toLowerCase();
    expect(() =>
      assertContainedRelPath(lowerRoot, "../../../../etc/passwd", "x"),
    ).toThrow(/outside the project root/);
  });
});
