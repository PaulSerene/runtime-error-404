/**
 * serena-reaper.test.ts
 *
 * Deterministic fixture-based tests for serena-reaper.ts pure functions and
 * the thin kill adapter validation.
 *
 * Coverage:
 *   Task 1 — parsePsOutput, buildAncestryMap, isDescendantOf, extractLspName,
 *             extractProjectFromCommand, discoverSerenaRoots
 *   Task 2 — parseLastCallToolRequest, activityFromMtime, activityFromCpuSamples,
 *             resolveActivitySignal (3-tier fallback)
 *   Task 3 — computeReapTargets (LRU-N, idle-timeout, grace window, T1-1)
 *   Task 4 — validateKillTarget (3-fold check + block-list), killLspProcess (mocked)
 *   Task 5 — parseSerenaReaperConfig, loadSerenaReaperConfigFromContent
 */

import { describe, expect, it, vi } from "vitest";
import {
  type ActivitySignal,
  activityFromCpuSamples,
  activityFromMtime,
  buildAncestryMap,
  computeReapTargets,
  DEFAULT_SERENA_REAPER_CONFIG,
  discoverSerenaRoots,
  executeReapPlan,
  extractLspName,
  extractProjectFromCommand,
  isDescendantOf,
  type KillAdapter,
  killLspProcess,
  type LspProc,
  loadSerenaReaperConfigFromContent,
  parseLastCallToolRequest,
  parsePsOutput,
  parseSerenaReaperConfig,
  resolveActivitySignal,
  type SerenaReaperConfig,
  type SerenaRoot,
  selectOrphanedSerenaRoots,
  shouldSkipScheduledReap,
  validateKillTarget,
} from "./serena-reaper.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Realistic ps output fixture.
 *
 * PIDs:
 *   100 - claude (parent of serena roots)
 *   200 - serena start-mcp-server --project /home/user/oh-my-agent (root 1)
 *   201 - tsserver under ~/.serena/ (LSP child of 200)
 *   202 - pyright under ~/.serena/ (LSP child of 200)
 *   203 - bash-language-server under ~/.serena/ (LSP child of 200)
 *   300 - serena start-mcp-server --project /home/user/shopzy (root 2)
 *   301 - tsserver under ~/.serena/ (LSP child of 300)
 *   400 - unrelated process (should not appear as LSP child)
 *   500 - serena start-mcp-server (no --project arg)
 */
const FIXTURE_PS_OUTPUT = `  PID  PPID    RSS COMMAND
  100     1  51200 claude
  200   100  14336 python /usr/local/bin/serena start-mcp-server --project /home/user/oh-my-agent
  201   200  94208 /home/user/.serena/venv/bin/tsserver --stdio
  202   200  43008 /home/user/.serena/venv/bin/pyright --outputjson
  203   200  40960 /home/user/.serena/venv/bin/bash-language-server --stdio
  300   100  14336 python /usr/local/bin/serena start-mcp-server --project /home/user/shopzy
  301   300  38912 /home/user/.serena/venv/bin/tsserver --stdio
  400     1  10240 vim
  500   100  14336 python /usr/local/bin/serena start-mcp-server
`;

const FIXTURE_LOG_WITH_CALLS = `2026-06-15T10:00:00.000Z CallToolRequest find_symbol foo
2026-06-15T10:05:00.000Z CallToolRequest get_symbols_overview bar
2026-06-15T10:10:00.000Z CallToolRequest search_for_pattern baz`;

const FIXTURE_LOG_EMPTY = `2026-06-15T09:00:00.000Z ServerStarted
2026-06-15T09:01:00.000Z SessionOpen`;

// Fixed reference time for deterministic tests: 2026-06-15T11:00:00.000Z
// (LAST_CALL + 50min, matching the fixture log's last CallToolRequest at 10:10Z)
const NOW_MS = Date.parse("2026-06-15T11:00:00.000Z");
// Corresponds to the last CallToolRequest in FIXTURE_LOG_WITH_CALLS
const LAST_CALL_MS = Date.parse("2026-06-15T10:10:00.000Z");
// 50 minutes ago from NOW_MS
const FIFTY_MIN_AGO = NOW_MS - 50 * 60 * 1000;
// 5 minutes ago from NOW_MS (within default 10-min idle and 90s grace)
const FIVE_MIN_AGO = NOW_MS - 5 * 60 * 1000;
// 2 minutes ago from NOW_MS (within default 90s grace? no: 2min > 90s)
const TWO_MIN_AGO = NOW_MS - 2 * 60 * 1000;
// 80 seconds ago (within 90s grace)
const EIGHTY_SEC_AGO = NOW_MS - 80 * 1000;

// ---------------------------------------------------------------------------
// Task 1: Process discovery
// ---------------------------------------------------------------------------

describe("parsePsOutput", () => {
  it("parses valid rows and skips the header", () => {
    const rows = parsePsOutput(FIXTURE_PS_OUTPUT);
    expect(rows.length).toBe(9);
  });

  it("parses pid, ppid, rssKb and command correctly", () => {
    const rows = parsePsOutput(FIXTURE_PS_OUTPUT);
    const serenaRoot = rows.find((r) => r.pid === 200);
    expect(serenaRoot).toBeDefined();
    expect(serenaRoot?.ppid).toBe(100);
    expect(serenaRoot?.rssKb).toBe(14336);
    expect(serenaRoot?.command).toContain("serena start-mcp-server");
  });

  it("handles empty input", () => {
    expect(parsePsOutput("")).toHaveLength(0);
  });

  it("skips lines with non-numeric pid/ppid/rss", () => {
    const badInput = "abc def ghi some command\n  10  20  30 good command\n";
    const rows = parsePsOutput(badInput);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pid).toBe(10);
  });

  it("parses RSS values as KB integers", () => {
    const rows = parsePsOutput(FIXTURE_PS_OUTPUT);
    const tsserver = rows.find((r) => r.pid === 201);
    expect(tsserver?.rssKb).toBe(94208);
  });
});

describe("buildAncestryMap", () => {
  it("builds a pid→ppid map", () => {
    const rows = parsePsOutput(FIXTURE_PS_OUTPUT);
    const map = buildAncestryMap(rows);
    expect(map.get(201)).toBe(200);
    expect(map.get(200)).toBe(100);
    expect(map.get(100)).toBe(1);
  });
});

describe("isDescendantOf", () => {
  const rows = parsePsOutput(FIXTURE_PS_OUTPUT);
  const ancestryMap = buildAncestryMap(rows);

  it("returns true for a direct child", () => {
    expect(isDescendantOf(201, 200, ancestryMap)).toBe(true);
  });

  it("returns true for a grandchild (if applicable)", () => {
    // 201 -> 200 -> 100: so 201 is a descendant of 100
    expect(isDescendantOf(201, 100, ancestryMap)).toBe(true);
  });

  it("returns false for unrelated processes", () => {
    // 400 has ppid=1, not related to 200
    expect(isDescendantOf(400, 200, ancestryMap)).toBe(false);
  });

  it("returns false for self", () => {
    expect(isDescendantOf(200, 200, ancestryMap)).toBe(false);
  });

  it("returns false for parent checking descendant", () => {
    expect(isDescendantOf(200, 201, ancestryMap)).toBe(false);
  });

  it("returns false for processes in the other root tree", () => {
    // 301 is under root 300, not 200
    expect(isDescendantOf(301, 200, ancestryMap)).toBe(false);
  });
});

describe("extractLspName", () => {
  it("extracts tsserver from path", () => {
    expect(extractLspName("/home/user/.serena/venv/bin/tsserver --stdio")).toBe(
      "tsserver",
    );
  });

  it("extracts pyright from path", () => {
    expect(
      extractLspName("/home/user/.serena/venv/bin/pyright --outputjson"),
    ).toBe("pyright");
  });

  it("extracts bash-language-server", () => {
    expect(
      extractLspName(
        "/home/user/.serena/venv/bin/bash-language-server --stdio",
      ),
    ).toBe("bash-language-server");
  });

  it("extracts typescript-language-server", () => {
    expect(extractLspName("/usr/bin/typescript-language-server --stdio")).toBe(
      "typescript-language-server",
    );
  });

  it("extracts gopls", () => {
    expect(extractLspName("/home/user/.serena/venv/bin/gopls serve")).toBe(
      "gopls",
    );
  });

  it("extracts rust-analyzer", () => {
    expect(extractLspName("/home/user/.serena/venv/bin/rust-analyzer")).toBe(
      "rust-analyzer",
    );
  });

  it("returns undefined for unrelated commands", () => {
    expect(extractLspName("vim /etc/hosts")).toBeUndefined();
    expect(extractLspName("claude")).toBeUndefined();
    expect(extractLspName("python serena start-mcp-server")).toBeUndefined();
  });

  // Regression: QA F2 — the allow-list must NOT match arbitrary binaries that
  // merely end in "-language-server" (no `.*-language-server` wildcard).
  it("does not match arbitrary *-language-server binaries", () => {
    expect(
      extractLspName("/home/user/.serena/venv/bin/evil-language-server"),
    ).toBeUndefined();
    expect(
      extractLspName("/home/user/.serena/venv/bin/my-language-server --stdio"),
    ).toBeUndefined();
  });
});

describe("extractProjectFromCommand", () => {
  it("extracts --project arg", () => {
    expect(
      extractProjectFromCommand(
        "python serena start-mcp-server --project /home/user/myproject",
      ),
    ).toBe("/home/user/myproject");
  });

  it("extracts --project= form", () => {
    expect(
      extractProjectFromCommand(
        "python serena start-mcp-server --project=/home/user/myproject",
      ),
    ).toBe("/home/user/myproject");
  });

  it("falls back to logProjectHint when --project is absent", () => {
    expect(
      extractProjectFromCommand(
        "python serena start-mcp-server",
        "/hint/project",
      ),
    ).toBe("/hint/project");
  });

  it("returns <unknown> when no project arg and no hint", () => {
    expect(extractProjectFromCommand("python serena start-mcp-server")).toBe(
      "<unknown>",
    );
  });
});

describe("discoverSerenaRoots", () => {
  const fixedActivity: ActivitySignal = {
    lastActivityMs: FIFTY_MIN_AGO,
    signalSource: "log",
  };
  const activityResolver = (_pid: number) => fixedActivity;

  it("finds serena root processes", () => {
    const roots = discoverSerenaRoots(FIXTURE_PS_OUTPUT, activityResolver);
    expect(roots.length).toBe(3); // PIDs 200, 300, 500
  });

  it("assigns correct project from --project arg", () => {
    const roots = discoverSerenaRoots(FIXTURE_PS_OUTPUT, activityResolver);
    const oma = roots.find((r) => r.pid === 200);
    expect(oma?.project).toBe("/home/user/oh-my-agent");
    const shopzy = roots.find((r) => r.pid === 300);
    expect(shopzy?.project).toBe("/home/user/shopzy");
  });

  it("assigns <unknown> project when no --project arg", () => {
    const roots = discoverSerenaRoots(FIXTURE_PS_OUTPUT, activityResolver);
    const noProject = roots.find((r) => r.pid === 500);
    expect(noProject?.project).toBe("<unknown>");
  });

  it("discovers LSP children for root 200", () => {
    const roots = discoverSerenaRoots(FIXTURE_PS_OUTPUT, activityResolver);
    const oma = roots.find((r) => r.pid === 200);
    expect(oma?.lspChildren.map((c) => c.pid).sort()).toEqual([201, 202, 203]);
  });

  it("discovers LSP children for root 300", () => {
    const roots = discoverSerenaRoots(FIXTURE_PS_OUTPUT, activityResolver);
    const shopzy = roots.find((r) => r.pid === 300);
    expect(shopzy?.lspChildren.map((c) => c.pid)).toEqual([301]);
  });

  it("does not include unrelated process 400 as LSP child", () => {
    const roots = discoverSerenaRoots(FIXTURE_PS_OUTPUT, activityResolver);
    const allLspPids = roots.flatMap((r) => r.lspChildren.map((c) => c.pid));
    expect(allLspPids).not.toContain(400);
  });

  it("uses logProjectHints for project resolution", () => {
    const hints = new Map([[500, "/hint/project"]]);
    const roots = discoverSerenaRoots(
      FIXTURE_PS_OUTPUT,
      activityResolver,
      hints,
    );
    const noProject = roots.find((r) => r.pid === 500);
    expect(noProject?.project).toBe("/hint/project");
  });

  it("converts rssKb to rssMb", () => {
    const roots = discoverSerenaRoots(FIXTURE_PS_OUTPUT, activityResolver);
    const oma = roots.find((r) => r.pid === 200);
    // 14336 KB / 1024 = 14 MB
    expect(oma?.rssMb).toBeCloseTo(14, 1);
    // Check LSP rssMb too: 94208 / 1024 = 92
    const tsserver = oma?.lspChildren.find((c) => c.pid === 201);
    expect(tsserver?.rssMb).toBeCloseTo(92, 1);
  });
});

// ---------------------------------------------------------------------------
// Task 2: Last-activity signal (3-tier fallback)
// ---------------------------------------------------------------------------

describe("parseLastCallToolRequest", () => {
  it("returns the timestamp of the last CallToolRequest line", () => {
    const ts = parseLastCallToolRequest(FIXTURE_LOG_WITH_CALLS);
    // Last call: 2026-06-15T10:10:00.000Z
    expect(ts).toBe(LAST_CALL_MS);
  });

  it("returns undefined when no CallToolRequest lines exist", () => {
    expect(parseLastCallToolRequest(FIXTURE_LOG_EMPTY)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseLastCallToolRequest("")).toBeUndefined();
  });

  it("handles fractional seconds in timestamps", () => {
    const log = "2026-06-15T10:10:00.123Z CallToolRequest find_symbol test\n";
    const ts = parseLastCallToolRequest(log);
    expect(ts).toBe(Date.parse("2026-06-15T10:10:00.123Z"));
  });

  it("picks the last of multiple CallToolRequest lines", () => {
    const log = [
      "2026-06-15T10:00:00.000Z CallToolRequest first",
      "2026-06-15T10:05:00.000Z CallToolRequest second",
      "2026-06-15T10:10:00.000Z CallToolRequest last",
    ].join("\n");
    const ts = parseLastCallToolRequest(log);
    expect(ts).toBe(Date.parse("2026-06-15T10:10:00.000Z"));
  });
});

describe("activityFromMtime", () => {
  it("returns mtime as lastActivityMs with source mtime", () => {
    const signal = activityFromMtime(1_000_000);
    expect(signal.lastActivityMs).toBe(1_000_000);
    expect(signal.signalSource).toBe("mtime");
  });
});

describe("activityFromCpuSamples", () => {
  it("returns sample2WallMs when CPU delta exceeds threshold", () => {
    const signal = activityFromCpuSamples(100, 200, 1_000, 2_000);
    expect(signal.lastActivityMs).toBe(2_000);
    expect(signal.signalSource).toBe("cpu");
  });

  it("returns sample1WallMs when CPU delta is below threshold (idle)", () => {
    // delta = 5ms, threshold default = 10ms → idle
    const signal = activityFromCpuSamples(100, 105, 1_000, 2_000);
    expect(signal.lastActivityMs).toBe(1_000);
    expect(signal.signalSource).toBe("cpu");
  });

  it("handles custom idle threshold", () => {
    // delta = 15ms, threshold = 20ms → idle
    const signal = activityFromCpuSamples(100, 115, 1_000, 2_000, 20);
    expect(signal.lastActivityMs).toBe(1_000);
    expect(signal.signalSource).toBe("cpu");
  });
});

describe("resolveActivitySignal — 3-tier fallback", () => {
  it("Tier 1: uses log content when CallToolRequest lines are present", () => {
    const signal = resolveActivitySignal(
      FIXTURE_LOG_WITH_CALLS,
      NOW_MS - 5000,
      undefined,
      NOW_MS,
    );
    expect(signal.signalSource).toBe("log");
    expect(signal.lastActivityMs).toBe(LAST_CALL_MS);
  });

  it("Tier 2: falls back to mtime when log has no CallToolRequest lines", () => {
    const mtimeMs = NOW_MS - 3000;
    const signal = resolveActivitySignal(
      FIXTURE_LOG_EMPTY,
      mtimeMs,
      undefined,
      NOW_MS,
    );
    expect(signal.signalSource).toBe("mtime");
    expect(signal.lastActivityMs).toBe(mtimeMs);
  });

  it("Tier 2: falls back to mtime when logContent is undefined", () => {
    const mtimeMs = NOW_MS - 3000;
    const signal = resolveActivitySignal(undefined, mtimeMs, undefined, NOW_MS);
    expect(signal.signalSource).toBe("mtime");
    expect(signal.lastActivityMs).toBe(mtimeMs);
  });

  it("Tier 3: falls back to CPU samples when no log and no mtime", () => {
    const signal = resolveActivitySignal(undefined, undefined, {
      sample1CpuMs: 100,
      sample2CpuMs: 200,
      sample1WallMs: 1_000,
      sample2WallMs: 2_000,
    });
    expect(signal.signalSource).toBe("cpu");
    expect(signal.lastActivityMs).toBe(2_000);
  });

  it("uses nowMs as last resort when no signal is available", () => {
    const signal = resolveActivitySignal(
      undefined,
      undefined,
      undefined,
      NOW_MS,
    );
    expect(signal.signalSource).toBe("cpu");
    expect(signal.lastActivityMs).toBe(NOW_MS);
  });

  it("Tier 1 takes priority over Tier 2 (mtime)", () => {
    const signal = resolveActivitySignal(
      FIXTURE_LOG_WITH_CALLS,
      NOW_MS,
      undefined,
      NOW_MS,
    );
    expect(signal.signalSource).toBe("log");
  });

  it("Tier 2 takes priority over Tier 3 (cpu)", () => {
    const mtimeMs = 999;
    const signal = resolveActivitySignal(
      FIXTURE_LOG_EMPTY,
      mtimeMs,
      {
        sample1CpuMs: 100,
        sample2CpuMs: 200,
        sample1WallMs: 1_000,
        sample2WallMs: 2_000,
      },
      NOW_MS,
    );
    expect(signal.signalSource).toBe("mtime");
    expect(signal.lastActivityMs).toBe(mtimeMs);
  });
});

// ---------------------------------------------------------------------------
// Task 3: Policy engine
// ---------------------------------------------------------------------------

function makeRoot(
  pid: number,
  lastActivityMs: number,
  lspCount = 2,
): SerenaRoot {
  const lspChildren: LspProc[] = Array.from({ length: lspCount }, (_, i) => ({
    pid: pid * 100 + i,
    name: "tsserver",
    rssMb: 50,
  }));
  return {
    pid,
    ppid: 1,
    project: `/project/${pid}`,
    lastActivityMs,
    signalSource: "log",
    lspChildren,
    rssMb: 14,
  };
}

const DEFAULT_CONFIG: SerenaReaperConfig = {
  ...DEFAULT_SERENA_REAPER_CONFIG,
};

describe("computeReapTargets — LRU policy", () => {
  it("returns empty array when no roots", () => {
    expect(computeReapTargets([], DEFAULT_CONFIG, undefined, NOW_MS)).toEqual(
      [],
    );
  });

  it("keeps top-2 warm and targets the rest", () => {
    const roots = [
      makeRoot(1, NOW_MS - 60 * 60 * 1000), // 60min ago — least recent
      makeRoot(2, NOW_MS - 30 * 60 * 1000), // 30min ago
      makeRoot(3, NOW_MS - 5 * 60 * 1000), // 5min ago — most recent
    ];
    const targets = computeReapTargets(
      roots,
      DEFAULT_CONFIG,
      undefined,
      NOW_MS,
    );
    // keepWarm=2: roots 3 and 2 are kept; root 1 is the target
    expect(targets.length).toBe(1);
    expect(targets[0]?.root.pid).toBe(1);
  });

  it("returns empty when roots <= keepWarm", () => {
    const roots = [makeRoot(1, FIFTY_MIN_AGO), makeRoot(2, FIFTY_MIN_AGO)];
    const targets = computeReapTargets(
      roots,
      DEFAULT_CONFIG,
      undefined,
      NOW_MS,
    );
    expect(targets).toHaveLength(0);
  });

  it("grace window protects recently-active roots from being targeted", () => {
    // Root 1: 60min ago — would normally be targeted
    // Root 2: 80sec ago — outside grace (90s), may be targeted depending on rank
    // Root 3: 30sec ago — within grace, protected
    const roots = [
      makeRoot(1, NOW_MS - 60 * 60 * 1000),
      makeRoot(2, NOW_MS - 80 * 1000),
      makeRoot(3, NOW_MS - 30 * 1000),
    ];
    const config: SerenaReaperConfig = { ...DEFAULT_CONFIG, keepWarm: 1 };
    const targets = computeReapTargets(roots, config, undefined, NOW_MS);
    // Root 3 is most recent → kept warm
    // Root 2 is second → within keepWarm=1? No, only 1 kept. Root 2 would be targeted
    //   but 80s > 90s grace → not protected
    // Root 1 is least recent → targeted
    const targetPids = targets.map((t) => t.root.pid);
    // Root 3 is within grace (30s < 90s) → protected even if not in top-1
    expect(targetPids).not.toContain(3);
  });

  it("T1-1: parent claude activity extends the LRU key", () => {
    // Root 1: tool calls 60min ago, but parent claude active recently
    // Root 2: tool calls 5min ago
    // Root 3: tool calls 30min ago
    const roots = [
      makeRoot(1, NOW_MS - 60 * 60 * 1000),
      makeRoot(2, NOW_MS - 5 * 60 * 1000),
      makeRoot(3, NOW_MS - 30 * 60 * 1000),
    ];
    // Parent of root 1 (pid=1) was active 2 minutes ago → effective activity = 2min ago
    const parentActivity = new Map([[1, NOW_MS - 2 * 60 * 1000]]);
    const targets = computeReapTargets(
      roots,
      DEFAULT_CONFIG,
      parentActivity,
      NOW_MS,
    );
    // Effective: root1=2min ago, root2=5min ago, root3=30min ago
    // keepWarm=2: top 2 are root1 (most recent) and root2; root3 is targeted
    expect(targets.length).toBe(1);
    expect(targets[0]?.root.pid).toBe(3);
  });

  it("includes projected freed RSS in the target", () => {
    const roots = [
      makeRoot(1, FIFTY_MIN_AGO, 3), // 3 LSPs × 50 MB = 150 MB
      makeRoot(2, FIVE_MIN_AGO, 2),
      makeRoot(3, TWO_MIN_AGO, 2),
    ];
    const targets = computeReapTargets(
      roots,
      DEFAULT_CONFIG,
      undefined,
      NOW_MS,
    );
    expect(targets[0]?.projectedFreedRssMb).toBe(150);
  });
});

describe("computeReapTargets — idle policy", () => {
  const idleConfig: SerenaReaperConfig = {
    ...DEFAULT_CONFIG,
    policy: "idle",
    idleMinutes: 10,
    graceSeconds: 90,
  };

  it("targets roots idle beyond idleMinutes", () => {
    const roots = [
      makeRoot(1, FIFTY_MIN_AGO), // 50min idle → target
      makeRoot(2, FIVE_MIN_AGO), // 5min idle → not target
    ];
    const targets = computeReapTargets(roots, idleConfig, undefined, NOW_MS);
    expect(targets.length).toBe(1);
    expect(targets[0]?.root.pid).toBe(1);
  });

  it("includes idle duration in reason string", () => {
    const roots = [makeRoot(1, FIFTY_MIN_AGO)];
    const targets = computeReapTargets(roots, idleConfig, undefined, NOW_MS);
    expect(targets[0]?.reason).toContain("idle:");
    expect(targets[0]?.reason).toContain("50m");
  });

  it("grace window protects recently-active roots even in idle policy", () => {
    const roots = [
      makeRoot(1, EIGHTY_SEC_AGO), // 80s idle → within grace (90s) → protected
      makeRoot(2, FIFTY_MIN_AGO), // 50min idle → target
    ];
    const targets = computeReapTargets(roots, idleConfig, undefined, NOW_MS);
    expect(targets.length).toBe(1);
    expect(targets[0]?.root.pid).toBe(2);
  });

  it("returns empty when all roots are within idle threshold", () => {
    const roots = [makeRoot(1, FIVE_MIN_AGO), makeRoot(2, FIVE_MIN_AGO)];
    const targets = computeReapTargets(roots, idleConfig, undefined, NOW_MS);
    expect(targets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 4: Kill adapter with 3-fold safety
// ---------------------------------------------------------------------------

describe("validateKillTarget", () => {
  const rows = parsePsOutput(FIXTURE_PS_OUTPUT);
  const ancestryMap = buildAncestryMap(rows);

  const VALID_LSP_CMD = "/home/user/.serena/venv/bin/tsserver --stdio";
  const VALID_ROOT_PID = 200;
  const VALID_LSP_PID = 201;

  it("returns safe=true for a valid LSP child", () => {
    const result = validateKillTarget(
      VALID_LSP_PID,
      VALID_LSP_CMD,
      VALID_ROOT_PID,
      ancestryMap,
    );
    expect(result.safe).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("block-list: rejects serena root command", () => {
    const result = validateKillTarget(
      200,
      "python /usr/local/bin/serena start-mcp-server --project /home/user/oh-my-agent",
      100,
      ancestryMap,
    );
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("block-list");
  });

  it("(a) ancestry: rejects process not descended from serena root", () => {
    const result = validateKillTarget(
      400, // unrelated process
      VALID_LSP_CMD,
      VALID_ROOT_PID,
      ancestryMap,
    );
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("ancestry");
  });

  it("(b) allow-list: rejects command not matching LSP allow-list", () => {
    // Construct a fake ancestry where 201 has 200 as parent but command is vim
    const fakeMap = new Map([
      [201, 200],
      [200, 100],
    ]);
    const result = validateKillTarget(
      201,
      "/home/user/.serena/venv/bin/vim", // not an LSP
      200,
      fakeMap,
    );
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("allow-list");
  });

  it("(c) exec-path: rejects command not under ~/.serena/ or serena-agent/", () => {
    // Ancestry is valid (201→200), name matches, but path is wrong
    const result = validateKillTarget(
      201,
      "/usr/local/bin/tsserver --stdio", // not under .serena/
      VALID_ROOT_PID,
      ancestryMap,
    );
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("exec-path");
  });

  it("accepts path under serena-agent/", () => {
    const fakeMap = new Map([[201, 200]]);
    const result = validateKillTarget(
      201,
      "/home/user/serena-agent/bin/tsserver --stdio",
      200,
      fakeMap,
    );
    expect(result.safe).toBe(true);
  });

  it("all three checks are required: fails if only two pass", () => {
    // Valid ancestry + valid name, but wrong path
    const result = validateKillTarget(
      201,
      "/usr/bin/tsserver", // ancestry OK, name OK, path FAIL
      VALID_ROOT_PID,
      ancestryMap,
    );
    expect(result.safe).toBe(false);
  });
});

describe("selectOrphanedSerenaRoots", () => {
  const baseRoot = {
    pid: 200,
    ppid: 100,
    project: "/p",
    lastActivityMs: 0,
    signalSource: "mtime" as const,
    lspChildren: [],
    rssMb: 14,
  };

  it("selects roots reparented to init (ppid === 1) as orphaned", () => {
    const roots = [
      { ...baseRoot, pid: 200, ppid: 100 }, // live parent → keep
      { ...baseRoot, pid: 300, ppid: 1 }, // orphaned
    ];
    const orphans = selectOrphanedSerenaRoots(roots);
    expect(orphans.map((r) => r.pid)).toEqual([300]);
  });

  it("returns empty when no roots are orphaned", () => {
    expect(selectOrphanedSerenaRoots([baseRoot])).toEqual([]);
  });
});

// Regression: opt-in gate — the scheduled (--quiet) path must honor `enabled`.
describe("shouldSkipScheduledReap (opt-in gate, T1-4)", () => {
  it("skips the scheduled run when quiet and not enabled", () => {
    expect(shouldSkipScheduledReap(true, false, false)).toBe(true);
  });
  it("runs the scheduled path when enabled", () => {
    expect(shouldSkipScheduledReap(true, false, true)).toBe(false);
  });
  it("always runs an interactive (non-quiet) invocation regardless of enabled", () => {
    expect(shouldSkipScheduledReap(false, false, false)).toBe(false);
  });
  it("always allows --dry-run through (never kills) even when disabled+quiet", () => {
    expect(shouldSkipScheduledReap(true, true, false)).toBe(false);
  });
});

describe("killLspProcess (mocked adapter)", () => {
  const rows = parsePsOutput(FIXTURE_PS_OUTPUT);
  const ancestryMap = buildAncestryMap(rows);

  const validLsp: LspProc = {
    pid: 201,
    name: "tsserver",
    rssMb: 92,
  };
  const validCommand = "/home/user/.serena/venv/bin/tsserver --stdio";
  const serenaRootPid = 200;

  function makeMockAdapter(opts?: {
    killReturns?: boolean;
    sigkillReturns?: boolean;
    isAliveAfterTerm?: boolean;
    readCommandResult?: string | undefined;
  }): KillAdapter & {
    killCalls: Array<[number, string]>;
    sleepCalls: number[];
  } {
    const killCalls: Array<[number, string]> = [];
    const sleepCalls: number[] = [];
    return {
      killCalls,
      sleepCalls,
      kill: vi.fn((pid: number, signal: NodeJS.Signals) => {
        killCalls.push([pid, signal]);
        if (signal === "SIGKILL" && opts?.sigkillReturns !== undefined) {
          return opts.sigkillReturns;
        }
        return opts?.killReturns ?? true;
      }),
      isAlive: vi.fn(() => opts?.isAliveAfterTerm ?? false),
      sleep: vi.fn(async (ms: number) => {
        sleepCalls.push(ms);
      }),
      readCommand: vi.fn(() => opts?.readCommandResult),
    };
  }

  it("sends SIGTERM then checks if alive; no SIGKILL if process is gone", async () => {
    const adapter = makeMockAdapter({ isAliveAfterTerm: false });
    const result = await killLspProcess(
      validLsp,
      serenaRootPid,
      validCommand,
      ancestryMap,
      1,
      adapter,
    );
    expect(result.success).toBe(true);
    expect(adapter.killCalls).toHaveLength(1);
    expect(adapter.killCalls[0]).toEqual([201, "SIGTERM"]);
    expect(adapter.sleepCalls).toEqual([1000]); // 1s grace in ms
  });

  it("escalates to SIGKILL when process survives grace period", async () => {
    const adapter = makeMockAdapter({ isAliveAfterTerm: true });
    const result = await killLspProcess(
      validLsp,
      serenaRootPid,
      validCommand,
      ancestryMap,
      1,
      adapter,
    );
    expect(result.success).toBe(true);
    expect(adapter.killCalls).toHaveLength(2);
    expect(adapter.killCalls[1]).toEqual([201, "SIGKILL"]);
  });

  it("returns skippedReason when validation fails (serena root block-list)", async () => {
    const serenaRootLsp: LspProc = { pid: 200, name: "serena", rssMb: 14 };
    const adapter = makeMockAdapter();
    const result = await killLspProcess(
      serenaRootLsp,
      100,
      "python /usr/local/bin/serena start-mcp-server",
      ancestryMap,
      1,
      adapter,
    );
    expect(result.success).toBe(false);
    expect(result.skippedReason).toContain("block-list");
    // No kill should have been called
    expect(adapter.killCalls).toHaveLength(0);
  });

  it("returns skippedReason when SIGTERM fails", async () => {
    const adapter = makeMockAdapter({ killReturns: false });
    const result = await killLspProcess(
      validLsp,
      serenaRootPid,
      validCommand,
      ancestryMap,
      1,
      adapter,
    );
    expect(result.success).toBe(false);
    expect(result.skippedReason).toContain("SIGTERM failed");
  });

  // Regression: QA F1 — PID-reuse guard before SIGKILL escalation.
  it("skips SIGKILL when the PID was reused by a different process", async () => {
    const adapter = makeMockAdapter({
      isAliveAfterTerm: true,
      readCommandResult: "/usr/bin/some-unrelated-build-tool", // different command
    });
    const result = await killLspProcess(
      validLsp,
      serenaRootPid,
      validCommand,
      ancestryMap,
      1,
      adapter,
    );
    expect(result.success).toBe(false);
    expect(result.skippedReason).toContain("PID reused");
    // Only SIGTERM should have been sent — never SIGKILL to the reused PID.
    expect(adapter.killCalls).toHaveLength(1);
    expect(adapter.killCalls[0]).toEqual([201, "SIGTERM"]);
  });

  it("escalates to SIGKILL when the surviving PID still matches the original command", async () => {
    const adapter = makeMockAdapter({
      isAliveAfterTerm: true,
      readCommandResult: validCommand, // same command — genuine survivor
    });
    const result = await killLspProcess(
      validLsp,
      serenaRootPid,
      validCommand,
      ancestryMap,
      1,
      adapter,
    );
    expect(result.success).toBe(true);
    expect(adapter.killCalls).toHaveLength(2);
    expect(adapter.killCalls[1]).toEqual([201, "SIGKILL"]);
  });

  // Regression: QA F4 — honest reporting when SIGKILL itself fails.
  it("returns failure when SIGKILL fails (EPERM / already gone)", async () => {
    const adapter = makeMockAdapter({
      isAliveAfterTerm: true,
      sigkillReturns: false,
    });
    const result = await killLspProcess(
      validLsp,
      serenaRootPid,
      validCommand,
      ancestryMap,
      1,
      adapter,
    );
    expect(result.success).toBe(false);
    expect(result.skippedReason).toContain("SIGKILL failed");
  });
});

describe("executeReapPlan", () => {
  it("kills all LSP children of all reap targets", async () => {
    const roots = discoverSerenaRoots(FIXTURE_PS_OUTPUT, () => ({
      lastActivityMs: FIFTY_MIN_AGO,
      signalSource: "log",
    }));
    const targets = roots
      .filter((r) => r.pid === 200)
      .map((r) => ({
        root: r,
        reason: "test",
        projectedFreedRssMb: 150,
      }));

    const killedPids: number[] = [];
    const adapter: KillAdapter = {
      kill: vi.fn((pid) => {
        killedPids.push(pid);
        return true;
      }),
      isAlive: vi.fn(() => false),
      sleep: vi.fn(async () => {}),
    };

    const results = await executeReapPlan(
      targets,
      FIXTURE_PS_OUTPUT,
      1,
      adapter,
    );

    // Root 200 has LSP children 201, 202, 203
    expect(results.length).toBe(3);
    // All should succeed (valid paths, ancestry, names)
    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    // 201, 202, 203 all have valid paths; check which ones actually pass all 3 checks
    // 201: tsserver under .serena/ → valid
    // 202: pyright under .serena/ → valid
    // 203: bash-language-server under .serena/ → valid
    expect(succeeded.length).toBe(3);
    expect(failed.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Task 5: Config schema + loader
// ---------------------------------------------------------------------------

describe("parseSerenaReaperConfig", () => {
  it("returns defaults when given null/undefined", () => {
    expect(parseSerenaReaperConfig(null)).toEqual(DEFAULT_SERENA_REAPER_CONFIG);
    expect(parseSerenaReaperConfig(undefined)).toEqual(
      DEFAULT_SERENA_REAPER_CONFIG,
    );
  });

  it("returns defaults when given an array", () => {
    expect(parseSerenaReaperConfig([])).toEqual(DEFAULT_SERENA_REAPER_CONFIG);
  });

  it("parses a full valid config block", () => {
    const raw = {
      enabled: true,
      policy: "idle",
      keep_warm: 3,
      idle_minutes: 20,
      grace_seconds: 120,
    };
    const config = parseSerenaReaperConfig(raw);
    expect(config.enabled).toBe(true);
    expect(config.policy).toBe("idle");
    expect(config.keepWarm).toBe(3);
    expect(config.idleMinutes).toBe(20);
    expect(config.graceSeconds).toBe(120);
  });

  it("applies defaults for missing fields", () => {
    const config = parseSerenaReaperConfig({ enabled: true });
    expect(config.enabled).toBe(true);
    expect(config.policy).toBe(DEFAULT_SERENA_REAPER_CONFIG.policy);
    expect(config.keepWarm).toBe(DEFAULT_SERENA_REAPER_CONFIG.keepWarm);
    expect(config.idleMinutes).toBe(DEFAULT_SERENA_REAPER_CONFIG.idleMinutes);
    expect(config.graceSeconds).toBe(DEFAULT_SERENA_REAPER_CONFIG.graceSeconds);
  });

  it("rejects invalid policy — falls back to default", () => {
    const config = parseSerenaReaperConfig({ policy: "turbo" });
    expect(config.policy).toBe(DEFAULT_SERENA_REAPER_CONFIG.policy);
  });

  it("rejects negative keep_warm — falls back to default", () => {
    const config = parseSerenaReaperConfig({ keep_warm: -1 });
    expect(config.keepWarm).toBe(DEFAULT_SERENA_REAPER_CONFIG.keepWarm);
  });

  it("rejects zero idle_minutes — falls back to default", () => {
    const config = parseSerenaReaperConfig({ idle_minutes: 0 });
    expect(config.idleMinutes).toBe(DEFAULT_SERENA_REAPER_CONFIG.idleMinutes);
  });

  it("accepts zero grace_seconds (no grace period)", () => {
    const config = parseSerenaReaperConfig({ grace_seconds: 0 });
    expect(config.graceSeconds).toBe(0);
  });

  it("default enabled is false (opt-in)", () => {
    expect(DEFAULT_SERENA_REAPER_CONFIG.enabled).toBe(false);
    const config = parseSerenaReaperConfig({});
    expect(config.enabled).toBe(false);
  });
});

describe("loadSerenaReaperConfigFromContent", () => {
  it("parses enabled reaper config from YAML content", () => {
    const yaml = `
language: ko
model_preset: claude
serena_reaper:
  enabled: true
  policy: lru
  keep_warm: 3
  idle_minutes: 15
  grace_seconds: 60
`;
    const config = loadSerenaReaperConfigFromContent(yaml);
    expect(config.enabled).toBe(true);
    expect(config.policy).toBe("lru");
    expect(config.keepWarm).toBe(3);
    expect(config.idleMinutes).toBe(15);
    expect(config.graceSeconds).toBe(60);
  });

  it("returns defaults when serena_reaper block is absent", () => {
    const yaml = `
language: en
model_preset: claude
`;
    const config = loadSerenaReaperConfigFromContent(yaml);
    expect(config).toEqual(DEFAULT_SERENA_REAPER_CONFIG);
  });

  it("returns defaults on invalid YAML", () => {
    const config = loadSerenaReaperConfigFromContent("{ invalid yaml: :");
    expect(config).toEqual(DEFAULT_SERENA_REAPER_CONFIG);
  });

  it("returns defaults on empty string", () => {
    const config = loadSerenaReaperConfigFromContent("");
    expect(config).toEqual(DEFAULT_SERENA_REAPER_CONFIG);
  });

  it("enabled defaults to false (opt-in)", () => {
    const yaml = `
serena_reaper:
  policy: idle
`;
    const config = loadSerenaReaperConfigFromContent(yaml);
    expect(config.enabled).toBe(false);
  });
});
