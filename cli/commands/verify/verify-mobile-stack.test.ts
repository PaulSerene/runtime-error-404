import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectVerifyReport } from "./report.js";

function setupWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "oma-verify-mobile-"));
  mkdirSync(join(workspace, ".agents", "skills", "oma-mobile", "stack"), {
    recursive: true,
  });
  return workspace;
}

function writeStack(workspace: string, yaml: string): void {
  writeFileSync(
    join(workspace, ".agents", "skills", "oma-mobile", "stack", "stack.yaml"),
    yaml,
  );
}

function findCheck(
  result: ReturnType<typeof collectVerifyReport>,
  namePrefix: string,
) {
  return result.checks.find((c) => c.name.startsWith(namePrefix));
}

// verify-mobile uses Unix shell tools (grep, which, pipes) that aren't
// available on Windows. The feature itself is POSIX-only.
describe.skipIf(process.platform === "win32")(
  "verify mobile — stack.yaml dispatch",
  () => {
    let workspace: string;

    beforeEach(() => {
      workspace = setupWorkspace();
    });

    afterEach(() => {
      rmSync(workspace, { recursive: true, force: true });
    });

    it("swift manifest drives the checks and skips when swift binary is absent", () => {
      writeStack(
        workspace,
        [
          "language: swift",
          "verify:",
          "  syntax:",
          '    cmd: "swift build"',
          "    skip_if_missing: oma-bin-that-does-not-exist-xyz",
          "  tests:",
          '    cmd: "swift test"',
          "    skip_if_missing: oma-bin-that-does-not-exist-xyz",
          "",
        ].join("\n"),
      );
      const result = collectVerifyReport("mobile", workspace);

      // Manifest-driven checks must be present with Swift names
      const syntax = findCheck(result, "Swift Syntax");
      const tests = findCheck(result, "Swift Tests");
      expect(syntax).toBeDefined();
      expect(tests).toBeDefined();

      // Both should skip because the fake binary is absent from PATH
      expect(syntax?.status).toBe("skip");
      expect(syntax?.message).toMatch(/not available/);
      expect(tests?.status).toBe("skip");
      expect(tests?.message).toMatch(/not available/);

      // No Flutter check should be present
      const hasFlutter = result.checks.some((c) => c.name.includes("Flutter"));
      expect(hasFlutter).toBe(false);
    });

    it("no manifest falls back to Flutter checks", () => {
      // Remove the stack directory so no stack.yaml exists
      rmSync(join(workspace, ".agents", "skills", "oma-mobile", "stack"), {
        recursive: true,
      });
      const result = collectVerifyReport("mobile", workspace);

      // Flutter/Dart checks should be present (names include Flutter or Dart)
      const hasFlutterOrDart = result.checks.some(
        (c) => c.name.includes("Flutter") || c.name.includes("Dart"),
      );
      expect(hasFlutterOrDart).toBe(true);

      // No Swift check should be present
      const hasSwift = result.checks.some((c) => c.name.includes("Swift"));
      expect(hasSwift).toBe(false);
    });

    it("manifest with no verify block returns skip checks for syntax and tests", () => {
      writeStack(workspace, "language: swift\n");
      const result = collectVerifyReport("mobile", workspace);

      // Manifest-driven checks present with Swift names
      const syntax = findCheck(result, "Swift Syntax");
      const tests = findCheck(result, "Swift Tests");
      expect(syntax).toBeDefined();
      expect(tests).toBeDefined();

      // Both should skip with "No ... configured" message
      expect(syntax?.status).toBe("skip");
      expect(syntax?.message).toContain("No syntax check configured");
      expect(tests?.status).toBe("skip");
      expect(tests?.message).toContain("No tests check configured");
    });
  },
);
