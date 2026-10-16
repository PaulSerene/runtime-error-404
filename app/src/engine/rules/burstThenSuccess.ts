/**
 * Rule: RULE-FAILURE-THEN-SUCCESS
 * Detects burst of failures followed by a success for the same user+IP within a window.
 * Owner: Person A — No network access. No browser APIs.
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

  const det = detectionEvents(events, config).filter((e) => !isSuppressed(e, config) && e.username && e.sourceIp);

  // Group by user + sourceIp
  const key = (e: LogEvent) => `${e.username}::${e.sourceIp}`;
  const byPair = new Map<string, LogEvent[]>();
  for (const evt of det) {
    const k = key(evt);
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k)!.push(evt);
  }

  const alerts: Alert[] = [];

  for (const [k, evts] of byPair) {
    evts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const [username, sourceIp] = k.split("::");

    // For each success event, look back in the window for failures
    for (let s = 0; s < evts.length; s++) {
      const succ = evts[s];
      if (succ.result?.toUpperCase() !== "SUCCESS") continue;

      const succTs = new Date(succ.timestamp).getTime();
      const windowStart = succTs - windowMs;

      const precedingFailures = evts
        .slice(0, s)
        .filter((e) => {
          const t = new Date(e.timestamp).getTime();
          return t >= windowStart && e.result?.toUpperCase() === "FAILURE";
        });

      if (precedingFailures.length >= failThreshold) {
        const timeStart = precedingFailures[0].timestamp;
        alerts.push({
          id:          alertId(RULE_ID, username, timeStart),
          ruleId:      RULE_ID,
          username,
          timeStart,
          timeEnd:     succ.timestamp,
          severity:    "critical",
          evidenceIds: [...precedingFailures.map((e) => e.id), succ.id],
          explanation: `Suspicious indications: ${precedingFailures.length} failures followed by a successful login for user "${username}" from ${sourceIp} within ${config.thresholds["burstWindowMinutes"] ?? 15} minutes.`,
          details: { failureCount: precedingFailures.length, sourceIp },
        });
        // Only one alert per user+IP burst (advance past this success)
        break;
      }
    }
  }

  return alerts;
}
