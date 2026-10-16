import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileSyncMock = vi.hoisted(() => vi.fn());
const promptState = vi.hoisted(() => ({
  confirm: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
}));

vi.mock("@clack/prompts", () => promptState);

vi.mock("picocolors", () => ({
  default: new Proxy(
    {},
    {
      get: () => (value: string) => value,
    },
  ),
}));

import {
  getGitConfig,
  inspectRecommendedGitConfig,
  maybeApplyRecommendedGitConfig,
  setGitConfigGlobal,
} from "./git-recommended.js";

function mockGitVersionOk() {
  execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "--version") return "git version 2.40.0\n";
    throw Object.assign(new Error("unexpected"), { status: 1 });
  });
}

describe("getGitConfig / setGitConfigGlobal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns trimmed value when set", () => {
    execFileSyncMock.mockReturnValue("true\n");
    expect(getGitConfig("rerere.enabled")).toBe("true");
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "git",
      ["config", "--get", "rerere.enabled"],
      expect.objectContaining({ encoding: "utf-8" }),
    );
  });

  it("returns null when unset or git fails", () => {
    execFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error("exit 1"), { status: 1 });
    });
    expect(getGitConfig("rerere.enabled")).toBeNull();
  });

  it("writes via git config --global", () => {
    execFileSyncMock.mockReturnValue("");
    setGitConfigGlobal("init.defaultBranch", "main");
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "git",
      ["config", "--global", "init.defaultBranch", "main"],
      expect.any(Object),
    );
  });
});

describe("inspectRecommendedGitConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports unavailable when git is missing", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("not found");
    });
    const status = inspectRecommendedGitConfig();
    expect(status.available).toBe(false);
    expect(status.items).toEqual([]);
    expect(status.issueCount).toBe(0);
  });

  it("flags both settings when unset", () => {
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "--version")
        return "git version 2.40.0\n";
      throw Object.assign(new Error("unset"), { status: 1 });
    });
    const status = inspectRecommendedGitConfig();
    expect(status.available).toBe(true);
    expect(status.allOk).toBe(false);
    expect(status.issueCount).toBe(2);
    expect(status.items.map((i) => i.key)).toEqual([
      "rerere.enabled",
      "init.defaultBranch",
    ]);
    expect(status.items.every((i) => !i.ok && i.current === null)).toBe(true);
  });

  it("is allOk when both match desired values", () => {
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "--version")
        return "git version 2.40.0\n";
      if (args[0] === "config" && args[1] === "--get") {
        if (args[2] === "rerere.enabled") return "true\n";
        if (args[2] === "init.defaultBranch") return "main\n";
      }
      throw new Error("unexpected");
    });
    const status = inspectRecommendedGitConfig();
    expect(status.allOk).toBe(true);
    expect(status.issueCount).toBe(0);
  });

  it("flags init.defaultBranch when set to master", () => {
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "--version")
        return "git version 2.40.0\n";
      if (args[0] === "config" && args[1] === "--get") {
        if (args[2] === "rerere.enabled") return "true\n";
        if (args[2] === "init.defaultBranch") return "master\n";
      }
      throw new Error("unexpected");
    });
    const status = inspectRecommendedGitConfig();
    expect(status.issueCount).toBe(1);
    const branch = status.items.find((i) => i.key === "init.defaultBranch");
    expect(branch?.ok).toBe(false);
    expect(branch?.current).toBe("master");
  });
});

describe("maybeApplyRecommendedGitConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptState.isCancel.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not write in non-interactive mode", async () => {
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "--version")
        return "git version 2.40.0\n";
      throw Object.assign(new Error("unset"), { status: 1 });
    });

    const result = await maybeApplyRecommendedGitConfig({
      nonInteractive: true,
    });

    expect(result.skipped).toEqual(["rerere.enabled", "init.defaultBranch"]);
    expect(result.applied).toEqual([]);
    expect(promptState.confirm).not.toHaveBeenCalled();
    const writeCalls = execFileSyncMock.mock.calls.filter(
      (call) =>
        call[0] === "git" &&
        Array.isArray(call[1]) &&
        (call[1] as string[]).includes("--global"),
    );
    expect(writeCalls).toHaveLength(0);
  });

  it("applies settings when the user confirms", async () => {
    mockGitVersionOk();
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "--version")
        return "git version 2.40.0\n";
      if (args[0] === "config" && args[1] === "--get") {
        throw Object.assign(new Error("unset"), { status: 1 });
      }
      if (args[0] === "config" && args[1] === "--global") return "";
      throw new Error(`unexpected ${JSON.stringify(args)}`);
    });
    promptState.confirm.mockResolvedValue(true);

    const result = await maybeApplyRecommendedGitConfig({
      nonInteractive: false,
    });

    expect(result.applied).toEqual(["rerere.enabled", "init.defaultBranch"]);
    expect(result.skipped).toEqual([]);
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "git",
      ["config", "--global", "rerere.enabled", "true"],
      expect.any(Object),
    );
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "git",
      ["config", "--global", "init.defaultBranch", "main"],
      expect.any(Object),
    );
  });

  it("skips writes when the user declines", async () => {
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "--version")
        return "git version 2.40.0\n";
      if (args[0] === "config" && args[1] === "--get") {
        throw Object.assign(new Error("unset"), { status: 1 });
      }
      return "";
    });
    promptState.confirm.mockResolvedValue(false);

    const result = await maybeApplyRecommendedGitConfig({
      nonInteractive: false,
    });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(["rerere.enabled", "init.defaultBranch"]);
    const writeCalls = execFileSyncMock.mock.calls.filter(
      (call) =>
        call[0] === "git" &&
        Array.isArray(call[1]) &&
        (call[1] as string[]).includes("--global"),
    );
    expect(writeCalls).toHaveLength(0);
  });
});
