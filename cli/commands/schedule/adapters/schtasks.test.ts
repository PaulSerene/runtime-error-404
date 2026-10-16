/**
 * Tests for schedule/adapters/schtasks.ts
 *
 * Covers:
 * - isAvailable: true on win32, false on other platforms
 * - upsert: calls schtasks /Create with absolute /TR; includes schedule flags
 * - remove: calls schtasks /Delete /TN "<label>" /F
 * - listLabels: parses schtasks /Query /FO CSV output, filters dev.oma.* tasks
 * - cronToSchtasksFlags: common cron shapes correctly translated to schtasks flags
 *
 * All child_process calls now go through execFileSync (no shell interpolation).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockFsFunctions = vi.hoisted(() => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const mockExecFileSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", async () => ({
  default: mockFsFunctions,
  ...mockFsFunctions,
}));

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
  spawnSync: vi.fn(),
}));

const FAKE_HOME = "/fake/home";
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    homedir: vi.fn(() => FAKE_HOME),
  };
});

import { cronToSchtasksFlags, SchtasksAdapter } from "./schtasks.js";

const JOB_ID = "sch_testjob00001";
const LABEL = `dev.oma.${JOB_ID}`;
const WORKSPACE = "/projects/my-app";
const ABS_OMA = "C:\\Users\\user\\.bun\\bin\\oma.exe";

const sampleSpec = {
  id: JOB_ID,
  cron: "0 9 * * *",
  command: ["oma", "schedule:run", JOB_ID],
  label: LABEL,
  workspace: WORKSPACE,
};

describe("SchtasksAdapter", () => {
  let adapter: SchtasksAdapter;

  beforeEach(() => {
    adapter = new SchtasksAdapter();
    vi.clearAllMocks();

    mockExecFileSync.mockImplementation((file: string, args: string[]) => {
      // resolveOmaBinary: where oma
      if (file === "where" && args[0] === "oma") {
        return `${ABS_OMA}\r\n`;
      }
      return "";
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // isAvailable
  // ---------------------------------------------------------------------------

  describe("isAvailable", () => {
    it("returns true on win32", async () => {
      const orig = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });
      expect(await adapter.isAvailable()).toBe(true);
      Object.defineProperty(process, "platform", { value: orig });
    });

    it("returns false on darwin", async () => {
      const orig = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin" });
      expect(await adapter.isAvailable()).toBe(false);
      Object.defineProperty(process, "platform", { value: orig });
    });

    it("returns false on linux", async () => {
      const orig = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });
      expect(await adapter.isAvailable()).toBe(false);
      Object.defineProperty(process, "platform", { value: orig });
    });
  });

  // ---------------------------------------------------------------------------
  // upsert
  // ---------------------------------------------------------------------------

  describe("upsert", () => {
    it("calls execFileSync schtasks /Create with the correct task name", async () => {
      await adapter.upsert(sampleSpec);

      const createCall = mockExecFileSync.mock.calls.find(
        (c: unknown[]) =>
          c[0] === "schtasks" &&
          Array.isArray(c[1]) &&
          (c[1] as string[]).includes("/Create"),
      ) as [string, string[]] | undefined;

      expect(createCall).toBeDefined();
      const args = createCall?.[1] ?? [];
      const tnIdx = args.indexOf("/TN");
      expect(tnIdx).toBeGreaterThan(-1);
      expect(args[tnIdx + 1]).toBe(LABEL);
    });

    it("/TR uses absolute oma path (not bare 'oma')", async () => {
      await adapter.upsert(sampleSpec);

      const createCall = mockExecFileSync.mock.calls.find(
        (c: unknown[]) =>
          c[0] === "schtasks" &&
          Array.isArray(c[1]) &&
          (c[1] as string[]).includes("/Create"),
      ) as [string, string[]] | undefined;

      const args = createCall?.[1] ?? [];
      const trIdx = args.indexOf("/TR");
      const taskRun = args[trIdx + 1] ?? "";
      expect(taskRun).toContain(ABS_OMA);
      expect(taskRun).toContain("schedule:run");
      expect(taskRun).toContain(JOB_ID);
    });

    it("/TR includes schedule:run <id>", async () => {
      await adapter.upsert(sampleSpec);

      const createCall = mockExecFileSync.mock.calls.find(
        (c: unknown[]) =>
          c[0] === "schtasks" &&
          Array.isArray(c[1]) &&
          (c[1] as string[]).includes("/Create"),
      ) as [string, string[]] | undefined;

      const args = createCall?.[1] ?? [];
      const trIdx = args.indexOf("/TR");
      const taskRun = args[trIdx + 1] ?? "";
      expect(taskRun).toContain(`schedule:run ${JOB_ID}`);
    });

    it("includes /F flag for idempotent upsert", async () => {
      await adapter.upsert(sampleSpec);

      const createCall = mockExecFileSync.mock.calls.find(
        (c: unknown[]) =>
          c[0] === "schtasks" &&
          Array.isArray(c[1]) &&
          (c[1] as string[]).includes("/Create"),
      ) as [string, string[]] | undefined;

      expect(createCall?.[1]).toContain("/F");
    });

    it("translates daily cron '0 9 * * *' to /SC DAILY /ST 09:00", async () => {
      await adapter.upsert(sampleSpec);

      const createCall = mockExecFileSync.mock.calls.find(
        (c: unknown[]) =>
          c[0] === "schtasks" &&
          Array.isArray(c[1]) &&
          (c[1] as string[]).includes("/Create"),
      ) as [string, string[]] | undefined;

      const args = createCall?.[1] ?? [];
      expect(args).toContain("/SC");
      expect(args[args.indexOf("/SC") + 1]).toBe("DAILY");
      expect(args).toContain("/ST");
      expect(args[args.indexOf("/ST") + 1]).toBe("09:00");
    });

    it("translates every-5-minutes cron '*/5 * * * *' to /SC MINUTE /MO 5", async () => {
      const spec = { ...sampleSpec, cron: "*/5 * * * *" };
      await adapter.upsert(spec);

      const createCall = mockExecFileSync.mock.calls.find(
        (c: unknown[]) =>
          c[0] === "schtasks" &&
          Array.isArray(c[1]) &&
          (c[1] as string[]).includes("/Create"),
      ) as [string, string[]] | undefined;

      const args = createCall?.[1] ?? [];
      expect(args[args.indexOf("/SC") + 1]).toBe("MINUTE");
      expect(args[args.indexOf("/MO") + 1]).toBe("5");
    });
  });

  // ---------------------------------------------------------------------------
  // remove
  // ---------------------------------------------------------------------------

  describe("remove", () => {
    it("calls execFileSync schtasks /Delete /TN <label> /F", async () => {
      await adapter.remove(LABEL);

      const deleteCall = mockExecFileSync.mock.calls.find(
        (c: unknown[]) =>
          c[0] === "schtasks" &&
          Array.isArray(c[1]) &&
          (c[1] as string[]).includes("/Delete"),
      ) as [string, string[]] | undefined;

      expect(deleteCall).toBeDefined();
      const args = deleteCall?.[1] ?? [];
      const tnIdx = args.indexOf("/TN");
      expect(args[tnIdx + 1]).toBe(LABEL);
      expect(args).toContain("/F");
    });

    it("does not throw if task does not exist (no-op)", async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("The system cannot find the file specified.");
      });

      await expect(adapter.remove(LABEL)).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // listLabels
  // ---------------------------------------------------------------------------

  describe("listLabels", () => {
    it("parses CSV output and returns dev.oma.* task names", async () => {
      const csvOutput = [
        '"TaskName","Next Run Time","Status"',
        '"\\dev.oma.sch_aaa","6/17/2026 9:00:00 AM","Ready"',
        '"\\dev.oma.sch_bbb","6/17/2026 10:00:00 AM","Ready"',
        '"\\Microsoft\\Windows\\SomeSysTask","N/A","Disabled"',
        "",
      ].join("\n");

      mockExecFileSync.mockImplementation((file: string, args: string[]) => {
        if (file === "schtasks" && args.includes("/Query")) {
          return csvOutput;
        }
        return "";
      });

      const labels = await adapter.listLabels();
      expect(labels).toContain("dev.oma.sch_aaa");
      expect(labels).toContain("dev.oma.sch_bbb");
      expect(labels).not.toContain("Microsoft\\Windows\\SomeSysTask");
    });

    it("normalizes backslash-prefixed task names", async () => {
      const csvOutput = [
        '"TaskName","Next Run Time","Status"',
        '"\\dev.oma.sch_test","N/A","Ready"',
      ].join("\n");

      mockExecFileSync.mockImplementation((file: string, args: string[]) => {
        if (file === "schtasks" && args.includes("/Query")) {
          return csvOutput;
        }
        return "";
      });

      const labels = await adapter.listLabels();
      expect(labels).toContain("dev.oma.sch_test");
      // Must not include the leading backslash
      expect(labels).not.toContain("\\dev.oma.sch_test");
    });

    it("returns empty array when schtasks /Query fails", async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("Access denied");
      });

      const labels = await adapter.listLabels();
      expect(labels).toEqual([]);
    });

    it("returns empty array when no oma tasks exist", async () => {
      const csvOutput = [
        '"TaskName","Next Run Time","Status"',
        '"\\Microsoft\\Windows\\SomeTask","N/A","Disabled"',
      ].join("\n");

      mockExecFileSync.mockImplementation((file: string, args: string[]) => {
        if (file === "schtasks" && args.includes("/Query")) {
          return csvOutput;
        }
        return "";
      });

      const labels = await adapter.listLabels();
      expect(labels).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// cronToSchtasksFlags -- unit tests
// ---------------------------------------------------------------------------

describe("cronToSchtasksFlags", () => {
  it("'*/5 * * * *' -> /SC MINUTE /MO 5", () => {
    const { scheduleArgs } = cronToSchtasksFlags("*/5 * * * *");
    expect(scheduleArgs).toEqual(["/SC", "MINUTE", "/MO", "5"]);
  });

  it("'*/1 * * * *' -> /SC MINUTE /MO 1", () => {
    const { scheduleArgs } = cronToSchtasksFlags("*/1 * * * *");
    expect(scheduleArgs).toEqual(["/SC", "MINUTE", "/MO", "1"]);
  });

  it("'30 * * * *' -> /SC HOURLY /ST 00:30 (at :30 of every hour)", () => {
    const { scheduleArgs } = cronToSchtasksFlags("30 * * * *");
    expect(scheduleArgs).toEqual(["/SC", "HOURLY", "/ST", "00:30"]);
  });

  it("'0 9 * * *' -> /SC DAILY /ST 09:00", () => {
    const { scheduleArgs } = cronToSchtasksFlags("0 9 * * *");
    expect(scheduleArgs).toEqual(["/SC", "DAILY", "/ST", "09:00"]);
  });

  it("'0 9 * * 1' -> /SC WEEKLY /D MON /ST 09:00", () => {
    const { scheduleArgs } = cronToSchtasksFlags("0 9 * * 1");
    expect(scheduleArgs).toEqual([
      "/SC",
      "WEEKLY",
      "/D",
      "MON",
      "/ST",
      "09:00",
    ]);
  });

  it("'0 9 * * 0' -> /SC WEEKLY /D SUN /ST 09:00 (dow 0 = Sunday)", () => {
    const { scheduleArgs } = cronToSchtasksFlags("0 9 * * 0");
    expect(scheduleArgs).toEqual([
      "/SC",
      "WEEKLY",
      "/D",
      "SUN",
      "/ST",
      "09:00",
    ]);
  });

  it("'0 9 * * 7' -> /SC WEEKLY /D SUN /ST 09:00 (dow 7 = Sunday)", () => {
    const { scheduleArgs } = cronToSchtasksFlags("0 9 * * 7");
    expect(scheduleArgs).toEqual([
      "/SC",
      "WEEKLY",
      "/D",
      "SUN",
      "/ST",
      "09:00",
    ]);
  });

  it("'0 0 1 * *' -> /SC MONTHLY /D 1 /ST 00:00", () => {
    const { scheduleArgs } = cronToSchtasksFlags("0 0 1 * *");
    expect(scheduleArgs).toEqual(["/SC", "MONTHLY", "/D", "1", "/ST", "00:00"]);
  });

  it("throws on complex minute field like '0,30 9 * * *'", () => {
    expect(() => cronToSchtasksFlags("0,30 9 * * *")).toThrow(
      /complex minute\/hour/,
    );
  });

  it("'0 9 * * 1-5' -> /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 09:00 (dow range)", () => {
    const { scheduleArgs } = cronToSchtasksFlags("0 9 * * 1-5");
    expect(scheduleArgs).toEqual([
      "/SC",
      "WEEKLY",
      "/D",
      "MON,TUE,WED,THU,FRI",
      "/ST",
      "09:00",
    ]);
  });

  it("'0 9 * * 1,3,5' -> /SC WEEKLY /D MON,WED,FRI /ST 09:00 (dow list)", () => {
    const { scheduleArgs } = cronToSchtasksFlags("0 9 * * 1,3,5");
    expect(scheduleArgs).toEqual([
      "/SC",
      "WEEKLY",
      "/D",
      "MON,WED,FRI",
      "/ST",
      "09:00",
    ]);
  });

  it("throws on invalid dow like '0 9 * * 8'", () => {
    expect(() => cronToSchtasksFlags("0 9 * * 8")).toThrow(
      /invalid day-of-week/,
    );
  });

  it("throws on reversed dow range like '0 9 * * 5-1'", () => {
    expect(() => cronToSchtasksFlags("0 9 * * 5-1")).toThrow(
      /invalid day-of-week/,
    );
  });

  it("throws on unsupported complex shape '0 9 1 * 1'", () => {
    // both dom and dow specified -- ambiguous; schtasks doesn't support this directly
    expect(() => cronToSchtasksFlags("0 9 1 * 1")).toThrow();
  });

  it("throws on invalid field count", () => {
    expect(() => cronToSchtasksFlags("0 9 *")).toThrow(/5 fields/);
  });
});
