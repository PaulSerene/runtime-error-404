/**
 * Rule: RULE-BRUTE-FORCE
 * Detects repeated authentication failures for a single user within a time window.
 * Owner: Person A — No network access. No browser APIs.
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
  const windowMs  = (config.thresholds["failureWindowMinutes"] ?? 10) * 60 * 1000;

  const det = detectionEvents(events, config);
  // Only failure events that are not suppressed
  const failures = det.filter(
    (e) =>
      !isSuppressed(e, config) &&
      e.username &&
      e.result?.toUpperCase() === "FAILURE",
  );

  // Group by username
  const byUser = new Map<string, LogEvent[]>();
  for (const evt of failures) {
    if (!byUser.has(evt.username)) byUser.set(evt.username, []);
    byUser.get(evt.username)!.push(evt);
  }

  const alerts: Alert[] = [];

  for (const [username, evts] of byUser) {
    // Sort by time
    evts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Sliding window: find windows where count >= threshold
    let i = 0;
    while (i < evts.length) {
      const windowStart = new Date(evts[i].timestamp).getTime();
      let j = i;
      while (j < evts.length && new Date(evts[j].timestamp).getTime() - windowStart <= windowMs) {
        j++;
      }
      const count = j - i;
      if (count >= threshold) {
        const timeStart = evts[i].timestamp;
        const timeEnd   = evts[j - 1].timestamp;
        alerts.push({
          id:          alertId(RULE_ID, username, timeStart),
          ruleId:      RULE_ID,
          username,
          timeStart,
          timeEnd,
          severity:    "high",
          evidenceIds: evts.slice(i, j).map((e) => e.id),
          explanation: `Suspicious indications: ${count} authentication failures for user "${username}" within ${config.thresholds["failureWindowMinutes"] ?? 10} minutes.`,
          details: { failureCount: count, windowMs },
        });
        // Advance past this window to avoid duplicate alerts for same burst
        i = j;
      } else {
        i++;
      }
    }
  }

  return alerts;
}
