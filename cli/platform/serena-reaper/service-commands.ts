import { spawnSync } from "node:child_process";
import type {
  MemoryCommandStatus,
  MemoryServiceCommand,
  MemoryServiceCommandPlanOptions,
  MemoryServiceCommandResult,
  MemoryServiceCommandRunOptions,
} from "../../types/memory.js";
import {
  LAUNCHD_SERENA_REAPER_LABEL,
  SERENA_REAPER_TASK_NAME,
  serenaReaperSystemdServicePath,
} from "./service-files.js";

/**
 * Serena Reaper periodic task activation commands.
 *
 * Mirrors cli/platform/agentmemory/service-commands.ts but targets the
 * periodic scheduler units (launchd StartInterval / systemd .timer / Windows
 * TimeTrigger) rather than daemon KeepAlive units.
 */

export function defaultReaperCommandRunner(
  command: MemoryServiceCommand,
): MemoryCommandStatus {
  const result = spawnSync(command.bin, command.args, {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 10000,
  });
  return {
    status: result.status,
    error: result.error?.message ?? result.stderr?.trim() ?? undefined,
  };
}

function serviceDomain(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  return `gui/${uid}`;
}

/**
 * Build the install/uninstall command plan for the reaper periodic task.
 *
 * For Linux the `servicePath` received here is the .timer unit path; the
 * companion .service path is derived via `serenaReaperSystemdServicePath`.
 */
export function reaperServiceCommands(
  args: MemoryServiceCommandPlanOptions,
): MemoryServiceCommand[] {
  if (args.platform === "darwin") {
    const domain = serviceDomain();
    const serviceId = `${domain}/${LAUNCHD_SERENA_REAPER_LABEL}`;
    return args.action === "install"
      ? [
          {
            bin: "launchctl",
            args: ["bootout", domain, args.servicePath],
            optional: true,
          },
          { bin: "launchctl", args: ["bootstrap", domain, args.servicePath] },
          { bin: "launchctl", args: ["enable", serviceId] },
        ]
      : [
          { bin: "launchctl", args: ["disable", serviceId], optional: true },
          {
            bin: "launchctl",
            args: ["bootout", domain, args.servicePath],
            optional: true,
          },
        ];
  }

  if (args.platform === "linux") {
    const timerUnit = "oma-serena-reaper.timer";
    const serviceUnit = "oma-serena-reaper.service";
    return args.action === "install"
      ? [
          { bin: "systemctl", args: ["--user", "daemon-reload"] },
          {
            bin: "systemctl",
            args: ["--user", "enable", "--now", timerUnit],
          },
        ]
      : [
          {
            bin: "systemctl",
            args: ["--user", "disable", "--now", timerUnit],
            optional: true,
          },
          {
            bin: "systemctl",
            args: ["--user", "stop", serviceUnit],
            optional: true,
          },
          { bin: "systemctl", args: ["--user", "daemon-reload"] },
        ];
  }

  if (args.platform === "win32") {
    return args.action === "install"
      ? [
          {
            bin: "schtasks",
            args: [
              "/create",
              "/tn",
              SERENA_REAPER_TASK_NAME,
              "/xml",
              args.servicePath,
              "/f",
            ],
          },
        ]
      : [
          {
            bin: "schtasks",
            args: ["/end", "/tn", SERENA_REAPER_TASK_NAME],
            optional: true,
          },
          {
            bin: "schtasks",
            args: ["/delete", "/tn", SERENA_REAPER_TASK_NAME, "/f"],
            optional: true,
          },
        ];
  }

  return [];
}

export function formatReaperCommand(command: MemoryServiceCommand): string {
  return [command.bin, ...command.args].join(" ");
}

export function runReaperServiceCommands(
  args: MemoryServiceCommandRunOptions,
): MemoryServiceCommandResult {
  for (const command of args.commands) {
    const result = args.runner(command);
    if (result.status === 0 || command.optional) continue;
    return {
      activated: false,
      commandExitCode: result.status,
      commandError: result.error,
    };
  }
  return { activated: true };
}

export { serenaReaperSystemdServicePath };
