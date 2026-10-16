/**
 * Rule: RULE-UNKNOWN-ACCOUNT
 * Detects repeated attempts against unknown accounts or invalid-user events
 * (e.g., Windows 4625 substatus 0xC0000064, STATUS_NO_SUCH_USER, or explicit invalid user markers).
 */
import type { Alert, LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { isSuppressed, alertId, detectionEvents } from "@/engine/rules/guards";

export const RULE_ID = "RULE-UNKNOWN-ACCOUNT";

export function isInvalidUserEvent(evt: LogEvent): boolean {
  const subStatus = (evt.subStatus ?? "").toUpperCase();
  const rawRow = evt.rawRow.toUpperCase();
  const result = (evt.result ?? "").toUpperCase();
  const eventType = (evt.eventType ?? "").toUpperCase();

  // Windows NTSTATUS code for STATUS_NO_SUCH_USER
  if (subStatus.includes("C0000064") || subStatus.includes("NO_SUCH_USER")) return true;
  if (rawRow.includes("0XC0000064") || rawRow.includes("STATUS_NO_SUCH_USER")) return true;
  if (result.includes("UNKNOWN_USER") || result.includes("INVALID_USER") || result.includes("NO_SUCH_USER")) return true;
  if (eventType.includes("INVALID_USER") || eventType.includes("UNKNOWN_USER")) return true;

  // Obvious non-existent probing usernames
  const u = (evt.username ?? "").toLowerCase();
  if (["admin", "root", "guest", "test", "administrator"].includes(u) && result === "FAILURE") {
    // If username probe failed and appears with invalid indicators
    if (rawRow.includes("UNKNOWN") || rawRow.includes("INVALID")) return true;
  }

  return false;
}

export function unknownAccount(
  events: LogEvent[],
  _baselines: BaselineMap,
  config: Config,
  _ipLoc: Config["ipLocations"],
  _assets: Config["assets"],
): Alert[] {
  const minAttempts = config.thresholds["unknownAccountAttempts"] ?? 3;
  const windowMs = (config.thresholds["unknownAccountWindowMinutes"] ?? 30) * 60 * 1000;

  const det = detectionEvents(events, config).filter(
    (e) => !isSuppressed(e, config) && isInvalidUserEvent(e),
  );

  // Group by source IP or by targeted account if IP unavailable
  const bySource = new Map<string, LogEvent[]>();
  for (const evt of det) {
    const key = evt.sourceIp || evt.username || "unknown_source";
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(evt);
  }

  const alerts: Alert[] = [];

  for (const [sourceKey, evts] of bySource) {
    let i = 0;
    while (i < evts.length) {
      const windowStart = new Date(evts[i].timestamp).getTime();
      let j = i;
      while (j < evts.length && new Date(evts[j].timestamp).getTime() - windowStart <= windowMs) {
        j++;
      }

      const window = evts.slice(i, j);
      if (window.length >= minAttempts) {
        const timeStart = window[0].timestamp;
        const timeEnd = window[window.length - 1].timestamp;
        const distinctUsers = [...new Set(window.map((e) => e.username).filter(Boolean))];

        alerts.push({
          id: alertId(RULE_ID, sourceKey, timeStart),
          ruleId: RULE_ID,
          username: distinctUsers[0] || sourceKey,
          timeStart,
          timeEnd,
          severity: "high",
          evidenceIds: window.map((e) => e.id),
          explanation: `Suspicious indications: ${window.length} authentication attempts against unknown or non-existent accounts from "${sourceKey}" within ${config.thresholds["unknownAccountWindowMinutes"] ?? 30} minutes (targeted: ${distinctUsers.slice(0, 5).join(", ")}${distinctUsers.length > 5 ? "..." : ""}).`,
          details: {
            sourceKey,
            attemptCount: window.length,
            targetedAccounts: distinctUsers,
          },
        });
        i = j;
      } else {
        i++;
      }
    }
  }

  return alerts;
}
