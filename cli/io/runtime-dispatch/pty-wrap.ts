import { accessSync, constants } from "node:fs";
import path from "node:path";
import type { Invocation } from "./types.js";

/**
 * Vendors whose headless CLI only writes stdout when it is attached to a TTY.
 *
 * agy (Antigravity CLI) completes a full model round trip but emits nothing on
 * stdout when `--print`/`-p` runs against a non-TTY (pipe, file, subprocess):
 * exit code 0, no stderr. oma spawns every subagent with stdout/stderr pointed
 * at a log file, which trips exactly this bug, so the captured result is empty.
 *
 * Upstream: https://github.com/google-antigravity/antigravity-cli/issues/76
 * (Windows variant: .../issues/187). Until the CLI flushes stdout regardless of
 * TTY state, we work around it by running agy under a pseudo-terminal allocated
 * by `script(1)` so its stdout looks interactive.
 */
const PTY_REQUIRED_VENDORS = new Set(["antigravity"]);

/** Whether the resolved target vendor needs a PTY to emit headless stdout. */
export function targetVendorNeedsPty(targetVendor: string): boolean {
  return PTY_REQUIRED_VENDORS.has(targetVendor);
}

/** Outcome of attempting to allocate a PTY around an invocation. */
export type PtyWrapResult = {
  /** Invocation to spawn: PTY-wrapped when `wrapped` is true, else the original. */
  invocation: Invocation;
  /** Whether a pseudo-terminal was successfully allocated. */
  wrapped: boolean;
  /**
   * Set when `wrapped` is false but a PTY was needed, explaining why none could
   * be allocated so callers can warn instead of silently capturing empty output.
   */
  unsupportedReason?: string;
};

let scriptOnPath: boolean | null = null;

/** Cached check for a `script(1)` binary on PATH (BSD on macOS, util-linux on Linux). */
function hasScriptCommand(): boolean {
  if (scriptOnPath !== null) return scriptOnPath;
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  scriptOnPath = dirs.some((dir) => {
    try {
      accessSync(path.join(dir, "script"), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  return scriptOnPath;
}

/** POSIX single-quote escaping for embedding an argv into an `sh -c` string. */
function shQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Wrap an invocation so the child runs under a pseudo-terminal allocated by
 * `script(1)`, making its stdout look like a TTY.
 *
 * Returns `{ wrapped: false }` with an `unsupportedReason` when no PTY can be
 * allocated, so callers warn rather than silently capturing empty output:
 *   - Windows has no `script(1)`, and `winpty` itself requires a TTY stdin, so
 *     headless agy capture needs a ConPTY wrapper we do not ship (upstream
 *     antigravity-cli#187). Run agy interactively or orchestrate via another
 *     vendor (claude/codex).
 *   - `script` missing from PATH on a POSIX host (rare).
 *
 * The PTY adds CR line endings and a small start/stop marker to the captured
 * stream; that is acceptable for log capture and far better than silently
 * dropping the model's entire response.
 */
export function wrapInvocationWithPty(invocation: Invocation): PtyWrapResult {
  if (process.platform === "win32") {
    return {
      invocation,
      wrapped: false,
      unsupportedReason:
        "Windows has no script(1); agy headless capture needs a ConPTY wrapper (upstream antigravity-cli#187). " +
        "Run agy interactively (! agy) or set the agent's vendor to claude/codex for orchestration.",
    };
  }

  if (!hasScriptCommand()) {
    return {
      invocation,
      wrapped: false,
      unsupportedReason:
        "`script` not found on PATH; cannot allocate a PTY for headless agy capture. Install util-linux `script`.",
    };
  }

  const { command, args, env } = invocation;

  if (process.platform === "darwin") {
    // BSD script: `script -q <file> <command> [args...]`.
    // Command and args are passed through as argv (no shell, so no escaping),
    // and the child's exit status is propagated.
    return {
      invocation: {
        command: "script",
        args: ["-q", "/dev/null", command, ...args],
        env,
      },
      wrapped: true,
    };
  }

  // util-linux script: `script -q -e -c "<cmd>" <file>`.
  // `-c` runs the command string via `sh -c` (needs shell escaping) and
  // `-e` returns the child's exit code instead of script's own.
  const shellCommand = [command, ...args].map(shQuote).join(" ");
  return {
    invocation: {
      command: "script",
      args: ["-q", "-e", "-c", shellCommand, "/dev/null"],
      env,
    },
    wrapped: true,
  };
}
