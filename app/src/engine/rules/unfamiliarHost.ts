/**
 * Rule: RULE-UNFAMILIAR-HOST
 * Identifies a user authenticating from a host/device that has not been seen
 * in the user's historical baseline.
 *
 * Distinguishes a genuinely observed first-seen host from a host that cannot
 * be assessed because historical data is insufficient (handled via baseline guards).
 */
import type { Alert, LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { isSuppressed, alertId, detectionEvents } from "@/engine/rules/guards";

export const RULE_ID = "RULE-UNFAMILIAR-HOST";

export function unfamiliarHost(
  events: LogEvent[],
  baselines: BaselineMap,
  config: Config,
  _ipLoc: Config["ipLocations"],
  _assets: Config["assets"],
): Alert[] {
  const minBaselineEvents = config.thresholds["minBaselineEventsForHost"] ?? 3;

  const det = detectionEvents(events, config).filter(
    (e) =>
      !isSuppressed(e, config) &&
      e.username &&
      e.host &&
      e.result?.toUpperCase() === "SUCCESS",
  );

  const alerts: Alert[] = [];
  const alertedUserHosts = new Set<string>();

  for (const evt of det) {
    const baseline = baselines.get(evt.username);

    // Skip if baseline is absent or sample size is too small to make a claim
    if (!baseline || baseline.noBaseline || baseline.trainingEventCount < minBaselineEvents) {
      continue;
    }

    const knownHosts = baseline.knownHosts ?? new Set<string>();
    if (knownHosts.size === 0) continue;

    // Check if host is known
    if (!knownHosts.has(evt.host)) {
      const userHostKey = `${evt.username}::${evt.host}`;
      if (alertedUserHosts.has(userHostKey)) continue;
      alertedUserHosts.add(userHostKey);

      alerts.push({
        id: alertId(RULE_ID, evt.username, evt.timestamp),
        ruleId: RULE_ID,
        username: evt.username,
        timeStart: evt.timestamp,
        timeEnd: evt.timestamp,
        severity: "medium",
        evidenceIds: [evt.id],
        explanation: `Suspicious indications: user "${evt.username}" authenticated to unfamiliar host "${evt.host}", which was never seen during their baseline calibration period (${baseline.trainingEventCount} historical events analyzed).`,
        details: {
          host: evt.host,
          knownHosts: [...knownHosts],
          baselineEventCount: baseline.trainingEventCount,
          sourceIp: evt.sourceIp,
        },
      });
    }
  }

  return alerts;
}
