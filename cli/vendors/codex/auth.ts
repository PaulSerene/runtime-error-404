import { homedir } from "node:os";
import { join } from "node:path";
import { safeReadJson } from "../../utils/safe-json.js";

export function isCodexAuthenticated(): boolean {
  const auth = safeReadJson<{ tokens?: { access_token?: unknown } }>(
    join(homedir(), ".codex", "auth.json"),
  );
  return !!auth?.tokens?.access_token;
}
