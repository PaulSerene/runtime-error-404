import * as child_process from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCommitsWithStats,
  getDefaultBranch,
  getFileChanges,
  getShippingStreak,
} from "./git.js";

// Repo-sourced git calls now run through execFileSync (argv, no shell) after
// the command-injection hardening; the test mocks both entry points.
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

describe("retro/git.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses default branch from origin HEAD", () => {
    vi.mocked(child_process.execFileSync).mockReturnValue(
      "refs/remotes/origin/main",
    );

    expect(getDefaultBranch("/repo")).toBe("main");
  });

  it("parses commits with shortstat output", () => {
    vi.mocked(child_process.execFileSync).mockReturnValue(
      [
        "COMMIT:abc|Grace|g@example.com|1710000000|feat: add auth",
        " 1 file changed, 12 insertions(+), 3 deletions(-)",
      ].join("\n"),
    );

    expect(
      getCommitsWithStats(
        "/repo",
        { since: "7 days ago", label: "7d", days: 7 },
        "origin/main",
      ),
    ).toEqual([
      {
        hash: "abc",
        author: "Grace",
        email: "g@example.com",
        timestamp: 1710000000,
        subject: "feat: add auth",
        insertions: 12,
        deletions: 3,
      },
    ]);
  });

  it("parses file changes from numstat output", () => {
    vi.mocked(child_process.execFileSync).mockReturnValue(
      ["COMMIT:abc|Grace", "12\t3\tsrc/auth.ts"].join("\n"),
    );

    expect(
      getFileChanges(
        "/repo",
        { since: "7 days ago", label: "7d", days: 7 },
        "origin/main",
      ),
    ).toEqual([
      {
        file: "src/auth.ts",
        insertions: 12,
        deletions: 3,
        author: "Grace",
      },
    ]);
  });

  it("getShippingStreak: passes --date=format-local flag so git emits local-timezone dates", () => {
    // Return two consecutive local-date strings. We don't know today's exact
    // local date in the test runner, so we compute it the same way the
    // implementation does: via new Date() with hours zeroed to local midnight.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const fmt = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    vi.mocked(child_process.execFileSync).mockReturnValue(
      [fmt(today), fmt(yesterday)].join("\n"),
    );

    const streak = getShippingStreak("/repo", "main");

    // Verify the git args included the local-format flag
    const callArgs = vi.mocked(child_process.execFileSync).mock.calls[0];
    const gitArgs = callArgs?.[1] as string[];
    expect(gitArgs).toContain("--date=format-local:%Y-%m-%d");

    // Two consecutive days (today + yesterday) → streak of 2
    expect(streak).toBe(2);
  });

  it("getShippingStreak: returns 0 when git output is empty", () => {
    vi.mocked(child_process.execFileSync).mockReturnValue("");
    expect(getShippingStreak("/repo", "main")).toBe(0);
  });
});
