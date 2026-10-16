import { safeParseJson } from "../../utils/safe-json.js";
import { isRecord } from "../../utils/type-guards.js";
import { cliStatusOutput } from "../auth-utils.js";

export function isClaudeAuthenticated(): boolean {
  const output = cliStatusOutput("claude auth status");
  if (output === null) return false;
  const parsed = safeParseJson(output);
  return isRecord(parsed) && parsed.loggedIn === true;
}
