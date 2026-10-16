/**
 * Rule: RULE-LATERAL-MOVEMENT
 * Detects a user accessing many hosts not in their baseline within a short time window.
 * Owner: Person A — No network access. No browser APIs.
 */
import type { Alert, LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { isSuppressed, alertId, detectionEvents } from "@/engine/rules/guards";

export const RULE_ID = "RULE-LATERAL-MOVEMENT";

export function newHostAccess(
  events: LogEvent[],
  baselines: BaselineMap,
  config: Config,
  _ipLoc: Config["ipLocations"],
  _assets: Config["assets"],
): Alert[] {
  const minNewHosts = config.thresholds["newHostCount"] ?? 3;
  const windowMs    = (config.thresholds["newHostWindowHours"] ?? 24) * 60 * 60 * 1000;

  const det = detectionEvents(events, config).filter(
    (e) =>
      !isSuppressed(e, config) &&
      e.username &&
      e.host,
  );

  // Group by username
  const byUser = new Map<string, LogEvent[]>();
  for (const evt of det) {
    if (!byUser.has(evt.username)) byUser.set(evt.username, []);
    byUser.get(evt.username)!.push(evt);
  }

  const alerts: Alert[] = [];

  for (const [username, evts] of byUser) {
    const baseline = baselines.get(username);
    const knownHosts = baseline?.knownHosts ?? new Set<string>();

    // Only consider events touching hosts NOT in baseline
    const newHostEvents = evts.filter((e) => !knownHosts.has(e.host));
    if (newHostEvents.length === 0) continue;

    newHostEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Sliding window over new-host events
    let i = 0;
    while (i < newHostEvents.length) {
      const windowStart = new Date(newHostEvents[i].timestamp).getTime();
      let j = i;
      while (j < newHostEvents.length && new Date(newHostEvents[j].timestamp).getTime() - windowStart <= windowMs) {
        j++;
      }

      const window = newHostEvents.slice(i, j);
      const distinctHosts = new Set(window.map((e) => e.host));

      if (distinctHosts.size >= minNewHosts) {
        const timeStart = newHostEvents[i].timestamp;
        const timeEnd   = newHostEvents[j - 1].timestamp;
        alerts.push({
          id:          alertId(RULE_ID, username, timeStart),
          ruleId:      RULE_ID,
          username,
          timeStart,
          timeEnd,
          severity:    "high",
          evidenceIds: window.map((e) => e.id),
          explanation: `Suspicious indications: user "${username}" accessed ${distinctHosts.size} new hosts not in their baseline within a ${config.thresholds["newHostWindowHours"] ?? 24}-hour window.`,
          details: { distinctHostCount: distinctHosts.size, newHosts: [...distinctHosts] },
        });
        i = j;
      } else {
        i++;
      }
    }
  }

  return alerts;
}
