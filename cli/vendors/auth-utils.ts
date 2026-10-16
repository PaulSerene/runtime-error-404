import { execSync } from "node:child_process";

/**
 * Run a vendor CLI status command and return its stdout, or `null` on any
 * failure (missing binary, non-zero exit, timeout). stderr is suppressed —
 * auth probes must stay silent on the terminal.
 *
 * Shared by the per-vendor `isXAuthenticated()` checks that shell out to the
 * vendor CLI instead of reading a credentials file.
 */
export function cliStatusOutput(
  command: string,
  timeoutMs = 5000,
): string | null {
  try {
    return execSync(command, {
      stdio: ["pipe", "pipe", "ignore"],
      encoding: "utf-8",
      timeout: timeoutMs,
    });
  } catch {
    return null;
  }
}
