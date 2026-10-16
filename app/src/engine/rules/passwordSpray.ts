/**
 * Rule: RULE-PASSWORD-SPRAY
 * Detects a single sourceIp hitting many distinct accounts with failures in a short window.
 * Owner: Person A — No network access. No browser APIs.
 */
import type { Alert, LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { isSuppressed, alertId, detectionEvents } from "@/engine/rules/guards";

export const RULE_ID = "RULE-PASSWORD-SPRAY";

export function passwordSpray(
  events: LogEvent[],
  _baselines: BaselineMap,
  config: Config,
  _ipLoc: Config["ipLocations"],
  _assets: Config["assets"],
): Alert[] {
  const minAccounts = config.thresholds["sprayAccounts"] ?? 5;
  const windowMs    = (config.thresholds["sprayWindowMinutes"] ?? 10) * 60 * 1000;

  const det = detectionEvents(events, config).filter(
    (e) =>
      !isSuppressed(e, config) &&
      e.sourceIp &&
      e.username &&
      e.result?.toUpperCase() === "FAILURE",
  );

  // Group failure events by sourceIp
  const byIp = new Map<string, LogEvent[]>();
  for (const evt of det) {
    if (!byIp.has(evt.sourceIp)) byIp.set(evt.sourceIp, []);
    byIp.get(evt.sourceIp)!.push(evt);
  }

  const alerts: Alert[] = [];

  for (const [sourceIp, evts] of byIp) {
    // Sliding window — evts already in timestamp order
    let i = 0;
    while (i < evts.length) {
      const windowStart = new Date(evts[i].timestamp).getTime();
      let j = i;
      while (j < evts.length && new Date(evts[j].timestamp).getTime() - windowStart <= windowMs) {
        j++;
      }

      const window = evts.slice(i, j);
      const distinctAccounts = new Set(window.map((e) => e.username));

      if (distinctAccounts.size >= minAccounts) {
        const timeStart = evts[i].timestamp;
        const timeEnd   = evts[j - 1].timestamp;
        alerts.push({
          id:          alertId(RULE_ID, sourceIp, timeStart),
          ruleId:      RULE_ID,
          username:    sourceIp, // spray is IP-centric; username field holds attacker IP
          timeStart,
          timeEnd,
          severity:    "critical",
          evidenceIds: window.map((e) => e.id),
          explanation: `Suspicious indications: IP ${sourceIp} targeted ${distinctAccounts.size} distinct accounts with failures within ${config.thresholds["sprayWindowMinutes"] ?? 10} minutes (password spray pattern).`,
          details: {
            sourceIp,
            distinctAccountCount: distinctAccounts.size,
            targetedAccounts: [...distinctAccounts],
          },
        });
        // Advance past this window
        i = j;
      } else {
        i++;
      }
    }
  }

  return alerts;
}
