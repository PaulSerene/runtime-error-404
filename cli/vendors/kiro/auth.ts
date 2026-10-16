import { cliStatusOutput } from "../auth-utils.js";

/**
 * Checks whether the user is authenticated for Kiro CLI.
 * Uses `kiro-cli whoami` which exits 0 when logged in.
 */
export function isKiroAuthenticated(): boolean {
  return cliStatusOutput("kiro-cli whoami") !== null;
}
