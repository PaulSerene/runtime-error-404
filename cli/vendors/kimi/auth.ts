import { homedir } from "node:os";
import { join } from "node:path";
import { safeReadJson } from "../../utils/safe-json.js";

/**
 * Resolve Kimi Code CLI's config directory.
 *
 * Kimi honours `KIMI_CODE_HOME` to relocate its config dir; otherwise it uses
 * `~/.kimi-code/`. Kimi is global-only — it has no project-scoped config.
 */
export function kimiHome(): string {
  const override = process.env.KIMI_CODE_HOME?.trim();
  return override && override.length > 0
    ? override
    : join(homedir(), ".kimi-code");
}

/**
 * Shared skip reason used by the HOME-scoped Kimi installers (hooks, global-mode
 * MCP) when `~/.kimi-code/` does not exist yet — Kimi creates it on first
 * `kimi login`, and oma must not pre-create HOME config dirs.
 */
export const KIMI_HOME_MISSING_REASON =
  "~/.kimi-code not found — run `kimi login` first, then re-link";

/**
 * Candidate credential filenames written by Kimi's OAuth device-code flow
 * (`kimi login`). Kimi's docs state the token is written "to the same local
 * location as TUI `/login`" under the config dir but do not pin the exact
 * filename, so we probe the conventional names used by sibling OAuth CLIs.
 */
const KIMI_CREDENTIAL_FILES = [
  "auth.json",
  "credentials.json",
  "oauth_creds.json",
  "token.json",
] as const;

interface KimiCredential {
  access_token?: unknown;
  accessToken?: unknown;
  refresh_token?: unknown;
  refreshToken?: unknown;
  token?: unknown;
  api_key?: unknown;
  apiKey?: unknown;
}

function hasToken(cred: KimiCredential | null): boolean {
  if (!cred) return false;
  const fields = [
    cred.access_token,
    cred.accessToken,
    cred.refresh_token,
    cred.refreshToken,
    cred.token,
    cred.api_key,
    cred.apiKey,
  ];
  return fields.some((v) => typeof v === "string" && v.length > 0);
}

/**
 * Checks whether the user is authenticated for the Kimi Code CLI.
 *
 * Kimi authenticates via an RFC 8628 OAuth device-code flow (`kimi login`) and
 * has no `whoami`/status command, so authentication is inferred from a
 * token-bearing credential file under the config dir. A `KIMI_API_KEY` /
 * `MOONSHOT_API_KEY` env var is accepted as a fallback for key-based setups.
 */
export function isKimiAuthenticated(): boolean {
  if (
    (process.env.KIMI_API_KEY?.length ?? 0) > 0 ||
    (process.env.MOONSHOT_API_KEY?.length ?? 0) > 0
  ) {
    return true;
  }
  const base = kimiHome();
  return KIMI_CREDENTIAL_FILES.some((file) =>
    hasToken(safeReadJson<KimiCredential>(join(base, file))),
  );
}
