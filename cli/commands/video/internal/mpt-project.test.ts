import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mptVenvPython } from "./mpt-project.js";

// Regression test for FIX 2: mptVenvPython must return the correct interpreter
// path for each platform. On win32 the venv layout is Scripts\python.exe; on
// POSIX it is bin/python.
describe("mptVenvPython platform branch", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Restore the real platform descriptor after each test.
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("returns the POSIX path on linux/darwin", () => {
    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
    });
    const result = mptVenvPython("/some/mpt");
    expect(result).toBe(path.join("/some/mpt", ".venv", "bin", "python"));
    expect(result).not.toContain("Scripts");
    expect(result).not.toContain(".exe");
  });

  it("returns the Windows path on win32", () => {
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });
    const result = mptVenvPython("C:\\mpt");
    expect(result).toBe(path.join("C:\\mpt", ".venv", "Scripts", "python.exe"));
    expect(result).toContain("Scripts");
    expect(result).toContain("python.exe");
  });

  it("uses platform from process.platform at call time (not module load time)", () => {
    // Verify the branch reads process.platform dynamically on each invocation.
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });
    const posix = mptVenvPython("/dir");

    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });
    const win = mptVenvPython("/dir");

    expect(posix).not.toBe(win);
    expect(posix).toContain("bin");
    expect(win).toContain("Scripts");
  });
});
