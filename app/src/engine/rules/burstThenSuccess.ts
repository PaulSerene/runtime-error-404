/**
 * Rule: RULE-FAILURE-THEN-SUCCESS
 * Detects burst of failures followed by a success for the same user+IP within a window.
 * Owner: Person A — No network access. No browser APIs.
 *
 * Performance (Step 8):
 * - Events are pre-sorted by timestamp from ingest; no re-sorting needed.
 * - Sliding window over preceding failures for each success.
 */
import type { Alert, LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { isSuppressed, alertId, detectionEvents } from "@/engine/rules/guards";

export const RULE_ID = "RULE-FAILURE-THEN-SUCCESS";

export function burstThenSuccess(
  events: LogEvent[],
  _baselines: BaselineMap,
  config: Config,
  _ipLoc: Config["ipLocations"],
  _assets: Config["assets"],
): Alert[] {
  const failThreshold = config.thresholds["burstFailures"] ?? 3;
  const windowMs      = (config.thresholds["burstWindowMinutes"] ?? 15) * 60 * 1000;

  const det = detectionEvents(events, config).filter(
    (e) => !isSuppressed(e, config) && e.username && e.sourceIp,
  );

  // Group by user + sourceIp (order preserved because events is pre-sorted)
  const byPair = new Map<string, LogEvent[]>();
  for (const evt of det) {
    const k = `${evt.username}::${evt.sourceIp}`;
    let list = byPair.get(k);
    if (!list) {
      list = [];
      byPair.set(k, list);
    }
    list.push(evt);
  }

  const alerts: Alert[] = [];

  for (const [k, evts] of byPair) {
    const [username, sourceIp] = k.split("::");

    // Sliding window of preceding failures
    const recentFailures: LogEvent[] = [];

    for (let s = 0; s < evts.length; s++) {
      const evt = evts[s];
      const isSuccess = evt.result?.toUpperCase() === "SUCCESS";
      const isFailure = evt.result?.toUpperCase() === "FAILURE";
      const evtTs = new Date(evt.timestamp).getTime();

      // Prune failures older than windowMs from current event
      const windowStart = evtTs - windowMs;
      while (recentFailures.length > 0 && new Date(recentFailures[0].timestamp).getTime() < windowStart) {
        recentFailures.shift();
      }

      if (isFailure) {
        recentFailures.push(evt);
      } else if (isSuccess) {
        if (recentFailures.length >= failThreshold) {
          const timeStart = recentFailures[0].timestamp;
          alerts.push({
            id:          alertId(RULE_ID, username, timeStart),
            ruleId:      RULE_ID,
            username,
            timeStart,
            timeEnd:     evt.timestamp,
            severity:    "critical",
            evidenceIds: [...recentFailures.map((e) => e.id), evt.id],
            explanation: `Suspicious indications: ${recentFailures.length} failures followed by a successful login for user "${username}" from ${sourceIp} within ${config.thresholds["burstWindowMinutes"] ?? 15} minutes.`,
            details: { failureCount: recentFailures.length, sourceIp },
          });
          // Clear recent failures after alerting to avoid duplicate alerts on the same burst
          recentFailures.length = 0;
          break;
        }
      }
    }
  }

  return alerts;
}
