import { homedir } from "node:os";
import { join } from "node:path";
import { safeReadJson } from "../../utils/safe-json.js";
import { isRecord } from "../../utils/type-guards.js";

const AUTH_PATH = join(homedir(), ".grok", "auth.json");

/**
 * Checks whether the user is authenticated for Grok.
 *
 * Grok stores credentials in `~/.grok/auth.json`.
 * It also supports the `XAI_API_KEY` environment variable for headless/CI use.
 */
export function isGrokAuthenticated(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // API key takes precedence (common for CI / non-interactive use)
  if (env.XAI_API_KEY?.trim()) {
    return true;
  }

  // auth.json structure is an object where keys are issuer::client_id
  // and values contain at minimum: key (access token) or refresh_token
  const data = safeReadJson(AUTH_PATH);
  if (!isRecord(data)) {
    return false;
  }

  // Check if there's at least one entry with a token
  for (const entry of Object.values(data)) {
    if (isRecord(entry)) {
      if (typeof entry.key === "string" && entry.key.length > 0) {
        return true;
      }
      if (
        typeof entry.refresh_token === "string" &&
        entry.refresh_token.length > 0
      ) {
        return true;
      }
    }
  }

  return false;
}
