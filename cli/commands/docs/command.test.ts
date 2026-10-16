/**
 * Tests for docs/command.ts (CLI glue)
 *
 * Regression: `oma docs verify --report-file <path>` must write the full
 * markdown report file regardless of stdout format. The file write used to
 * live inside the markdown-only branch, so `--json --report-file` silently
 * skipped the file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock sibling modules (must be hoisted before the import under test)
// ---------------------------------------------------------------------------

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const extractMock = vi.hoisted(() => ({
  extractDocRefs: vi.fn(async () => ({
    schemaVersion: 1,
    generator: "test",
    docs: [],
  })),
  writeDocRefsIndex: vi.fn(),
}));

const resolveMock = vi.hoisted(() => ({
  resolveRefs: vi.fn(async () => ({
    scannedDocs: 0,
    totalRefs: 0,
    skippedCount: 0,
    broken: [],
  })),
}));

const reporterMock = vi.hoisted(() => ({
  renderJson: vi.fn(() => '{"broken":[]}'),
  renderMarkdown: vi.fn(() => "# Drift Report\n"),
}));

const urlCheckMock = vi.hoisted(() => ({
  countUrlRefs: vi.fn(() => 0),
  hasLychee: vi.fn(() => false),
  lycheeArgs: vi.fn(() => [] as string[]),
  readCheckUrlsConfig: vi.fn(() => false),
  readDocsExcludeConfig: vi.fn(() => [] as string[]),
  runLycheeSync: vi.fn(),
  spawnLycheeBackground: vi.fn(),
  urlReportPath: vi.fn(() => "/fake/url-drift.json"),
}));

vi.mock("node:fs", () => ({ default: fsMock, ...fsMock }));
vi.mock("./extract.js", () => extractMock);
vi.mock("./resolve.js", () => resolveMock);
vi.mock("./reporter.js", () => reporterMock);
vi.mock("./command/url-check.js", () => urlCheckMock);
vi.mock("./sync-propose.js", () => ({
  proposeSyncPatches: vi.fn(async () => []),
}));
vi.mock("./i18n-drift.js", () => ({
  detectI18nDrift: vi.fn(() => []),
  summarizeDrift: vi.fn(),
}));
vi.mock("./lint-i18n.js", () => ({
  lintI18nStyle: vi.fn(() => []),
  summarizeStyleIssues: vi.fn(),
}));
vi.mock("../../io/gitignore.js", () => ({ ensureGitignored: vi.fn() }));

import { Command } from "commander";
import { registerDocsCommands } from "./command.js";

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerDocsCommands(program);
  return program;
}

async function runVerify(...flags: string[]): Promise<void> {
  await buildProgram().parseAsync(["node", "oma", "docs", "verify", ...flags]);
}

describe("oma docs verify --report-file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("writes the markdown report file in markdown mode", async () => {
    await runVerify("--no-urls", "--report-file", "./drift.md");

    expect(reporterMock.renderMarkdown).toHaveBeenCalled();
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("drift.md"),
      "# Drift Report\n",
      "utf-8",
    );
  });

  it("writes the markdown report file alongside --json output (regression)", async () => {
    await runVerify("--json", "--no-urls", "--report-file", "./drift.md");

    expect(reporterMock.renderJson).toHaveBeenCalled();
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("drift.md"),
      "# Drift Report\n",
      "utf-8",
    );
  });

  it("does not write a report file when --report-file is absent", async () => {
    await runVerify("--json", "--no-urls");

    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });
});
