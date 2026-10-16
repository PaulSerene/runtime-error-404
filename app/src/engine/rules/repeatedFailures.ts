/**
 * Rule: RULE-BRUTE-FORCE
 * Detects repeated authentication failures for a single user within a time window.
 * Owner: Person A — No network access. No browser APIs.
 *
 * Performance (Step 8):
 * - Events are pre-sorted by timestamp from ingest; no re-sort needed.
 * - Uses a two-pointer sliding window per user group.
 */
import type { Alert, LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { isSuppressed, alertId, detectionEvents } from "@/engine/rules/guards";

export const RULE_ID = "RULE-BRUTE-FORCE";

export function repeatedFailures(
  events: LogEvent[],
  _baselines: BaselineMap,
  config: Config,
  _ipLoc: Config["ipLocations"],
  _assets: Config["assets"],
): Alert[] {
  const threshold = config.thresholds["failureCount"] ?? 5;
  const windowMs  = (config.thresholds["failureWindowMinutes"] ?? 10) * 60_000;

  // Events are pre-sorted; filter without re-sorting
  const failures = detectionEvents(events, config).filter(
    (e) => !isSuppressed(e, config) && e.username && e.result?.toUpperCase() === "FAILURE",
  );

  // Build per-user lists (order preserved)
  const byUser = new Map<string, LogEvent[]>();
  for (const evt of failures) {
    let list = byUser.get(evt.username);
    if (!list) { list = []; byUser.set(evt.username, list); }
    list.push(evt);
  }

  const alerts: Alert[] = [];

  for (const [username, evts] of byUser) {
    // Two-pointer sliding window — evts already in timestamp order
    let lo = 0;
    for (let hi = 0; hi < evts.length; hi++) {
      const hiTs = new Date(evts[hi].timestamp).getTime();
      // Advance lo until window fits
      while (new Date(evts[lo].timestamp).getTime() < hiTs - windowMs) lo++;
      const count = hi - lo + 1;
      if (count >= threshold) {
        const timeStart = evts[lo].timestamp;
        const timeEnd   = evts[hi].timestamp;
        alerts.push({
          id:          alertId(RULE_ID, username, timeStart),
          ruleId:      RULE_ID,
          username,
          timeStart,
          timeEnd,
          severity:    "high",
          evidenceIds: evts.slice(lo, hi + 1).map((e) => e.id),
          explanation: `Suspicious indications: ${count} authentication failures for user "${username}" within ${config.thresholds["failureWindowMinutes"] ?? 10} minutes.`,
          details: { failureCount: count, windowMs },
        });
        // Skip past this window to avoid duplicate alerts
        lo = hi + 1;
        hi = lo - 1; // hi++ will set it to lo
      }
    }
  }

  return alerts;
}
