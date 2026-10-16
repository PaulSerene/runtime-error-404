import { safeParseJson } from "../../utils/safe-json.js";
import { isRecord } from "../../utils/type-guards.js";
import { cliStatusOutput } from "../auth-utils.js";

const CURSOR_STATUS_COMMANDS = [
  "cursor agent status",
  "cursor-agent status",
] as const;

function hasCursorApiKey(env: NodeJS.ProcessEnv): boolean {
  return !!env.CURSOR_API_KEY?.trim();
}

function parseCursorStatus(output: string): boolean {
  const parsed = safeParseJson(output);
  if (isRecord(parsed)) {
    if (typeof parsed.authenticated === "boolean") {
      return parsed.authenticated;
    }
    if (typeof parsed.loggedIn === "boolean") {
      return parsed.loggedIn;
    }
  }

  const normalized = output.toLowerCase();

  if (
    /\b(not authenticated|not logged in|logged out|unauthenticated)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  return /\b(authenticated|logged in|login successful)\b/.test(normalized);
}

export function isCursorAuthenticated(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (hasCursorApiKey(env)) return true;

  for (const command of CURSOR_STATUS_COMMANDS) {
    // Try each supported Cursor CLI command shape until one reports success.
    const output = cliStatusOutput(command);
    if (output !== null && parseCursorStatus(output)) return true;
  }

  return false;
}
