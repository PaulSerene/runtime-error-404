import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import type {
  MemoryServiceOptions,
  MemoryServicePresence,
  MemoryServiceResult,
  MemoryServiceUninstallOptions,
} from "../types/memory.js";
import {
  defaultReaperCommandRunner,
  formatReaperCommand,
  reaperServiceCommands,
  runReaperServiceCommands,
} from "./serena-reaper/service-commands.js";
import {
  renderSerenaReaperLaunchdPlist,
  renderSerenaReaperSystemdService,
  renderSerenaReaperSystemdTimer,
  renderSerenaReaperWindowsTaskXml,
  serenaReaperServicePath,
  serenaReaperSystemdServicePath,
} from "./serena-reaper/service-files.js";

/**
 * Serena Reaper periodic scheduler orchestration.
 *
 * Facade over `platform/serena-reaper/`: service-file rendering lives in
 * `service-files.ts`, activation command plans in `service-commands.ts`.
 *
 * The reaper is a PERIODIC task (not a daemon):
 *   - launchd: StartInterval plist
 *   - systemd: .timer + oneshot .service pair
 *   - Windows: TimeTrigger scheduled task
 *
 * Design: docs/plans/designs/021-serena-memory-reaper.md §2.4, Task 7
 */

export { defaultReaperCommandRunner } from "./serena-reaper/service-commands.js";
export {
  LAUNCHD_SERENA_REAPER_LABEL,
  SERENA_REAPER_TASK_NAME,
} from "./serena-reaper/service-files.js";

export function getSerenaReaperServicePresence(
  args: { homeDir?: string; platform?: NodeJS.Platform } = {},
): MemoryServicePresence {
  const homeDir = args.homeDir ?? homedir();
  const platform = args.platform ?? process.platform;
  const servicePath = serenaReaperServicePath(homeDir, platform);
  return {
    platform,
    supported: servicePath !== undefined,
    servicePath,
    installed: servicePath ? existsSync(servicePath) : false,
  };
}

export function installSerenaReaperService(
  args: MemoryServiceOptions = {},
): MemoryServiceResult {
  const homeDir = args.homeDir ?? homedir();
  const platform = args.platform ?? process.platform;
  const servicePath = serenaReaperServicePath(homeDir, platform);

  // Build content. Linux requires two unit files (timer + service).
  let content: string | undefined;
  let extraPath: string | undefined;
  let extraContent: string | undefined;

  if (platform === "darwin") {
    content = renderSerenaReaperLaunchdPlist({ homeDir });
  } else if (platform === "linux" && servicePath) {
    content = renderSerenaReaperSystemdTimer();
    extraPath = serenaReaperSystemdServicePath(servicePath);
    extraContent = renderSerenaReaperSystemdService({ homeDir });
  } else if (platform === "win32") {
    content = renderSerenaReaperWindowsTaskXml();
  }

  const commands =
    servicePath === undefined
      ? []
      : reaperServiceCommands({ action: "install", platform, servicePath });
  const commandLines = commands.map(formatReaperCommand);

  const runner = args.runner ?? defaultReaperCommandRunner;
  let wroteFile = false;
  let activated = false;
  let commandExitCode: number | null | undefined;
  let commandError: string | undefined;

  if (servicePath && content && !args.dryRun) {
    mkdirSync(dirname(servicePath), { recursive: true, mode: 0o700 });
    writeFileSync(servicePath, content, { encoding: "utf-8", mode: 0o600 });
    wroteFile = true;

    // Write the companion .service unit for Linux
    if (extraPath && extraContent) {
      writeFileSync(extraPath, extraContent, {
        encoding: "utf-8",
        mode: 0o600,
      });
    }

    const commandResult = runReaperServiceCommands({ commands, runner });
    activated = commandResult.activated;
    commandExitCode = commandResult.commandExitCode;
    commandError = commandResult.commandError;

    // launchd bootstrap fallback (EIO on some macOS session contexts)
    if (!activated && platform === "darwin") {
      const legacy = runner({
        bin: "launchctl",
        args: ["load", "-w", servicePath],
      });
      commandLines.push(`launchctl load -w ${servicePath}`);
      if (legacy.status === 0) {
        activated = true;
        commandExitCode = 0;
        commandError = undefined;
      }
    }
  }

  return {
    action: "install",
    platform,
    supported: servicePath !== undefined,
    dryRun: args.dryRun === true,
    servicePath,
    wroteFile,
    removedFile: false,
    activated,
    commands: commandLines,
    commandExitCode,
    commandError,
    content: args.dryRun ? content : undefined,
    message:
      servicePath === undefined
        ? `Serena Reaper periodic task is not supported on ${platform}`
        : args.dryRun
          ? "Serena Reaper service file would be written and activated"
          : activated
            ? "Serena Reaper periodic task installed and activated"
            : "Serena Reaper service file installed but activation failed",
  };
}

export function uninstallSerenaReaperService(
  args: MemoryServiceUninstallOptions = {},
): MemoryServiceResult {
  const homeDir = args.homeDir ?? homedir();
  const platform = args.platform ?? process.platform;
  const servicePath = serenaReaperServicePath(homeDir, platform);
  const commands =
    servicePath === undefined
      ? []
      : reaperServiceCommands({ action: "uninstall", platform, servicePath });
  const commandLines = commands.map(formatReaperCommand);

  let removedFile = false;
  let activated = false;
  let commandExitCode: number | null | undefined;
  let commandError: string | undefined;

  if (servicePath && !args.dryRun) {
    const runner = args.runner ?? defaultReaperCommandRunner;
    const commandResult = runReaperServiceCommands({ commands, runner });
    activated = commandResult.activated;
    commandExitCode = commandResult.commandExitCode;
    commandError = commandResult.commandError;

    // Legacy launchctl unload fallback to match install fallback
    if (platform === "darwin") {
      runner({ bin: "launchctl", args: ["unload", "-w", servicePath] });
      commandLines.push(`launchctl unload -w ${servicePath}`);
    }

    if (existsSync(servicePath)) {
      rmSync(servicePath, { force: true });
      removedFile = true;
    }

    // Remove companion .service unit on Linux
    if (platform === "linux") {
      const extraPath = serenaReaperSystemdServicePath(servicePath);
      if (existsSync(extraPath)) {
        rmSync(extraPath, { force: true });
      }
    }
  }

  return {
    action: "uninstall",
    platform,
    supported: servicePath !== undefined,
    dryRun: args.dryRun === true,
    servicePath,
    wroteFile: false,
    removedFile,
    activated,
    commands: commandLines,
    commandExitCode,
    commandError,
    message:
      servicePath === undefined
        ? `Serena Reaper periodic task is not supported on ${platform}`
        : args.dryRun
          ? "Serena Reaper periodic task would be disabled and removed"
          : commandError
            ? "Serena Reaper service file removed but disable failed"
            : "Serena Reaper periodic task disabled and removed",
  };
}
