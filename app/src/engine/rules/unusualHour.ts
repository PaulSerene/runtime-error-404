/**
 * Rule: RULE-OFF-HOURS
 * Detects logins at hours outside the user's baseline hour distribution.
 * Owner: Person A — No network access. No browser APIs.
 */
import type { Alert, LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { isSuppressed, alertId, detectionEvents } from "@/engine/rules/guards";

export const RULE_ID = "RULE-OFF-HOURS";

export function unusualHour(
  events: LogEvent[],
  baselines: BaselineMap,
  config: Config,
  _ipLoc: Config["ipLocations"],
  _assets: Config["assets"],
): Alert[] {
  const minLogins = config.thresholds["minBaselineLogins"] ?? 10;

  const det = detectionEvents(events, config).filter(
    (e) =>
      !isSuppressed(e, config) &&
      e.username &&
      e.result?.toUpperCase() === "SUCCESS",
  );

  const alerts: Alert[] = [];

  for (const evt of det) {
    const baseline = baselines.get(evt.username);
    // Require a non-empty baseline with enough training logins
    if (!baseline || baseline.noBaseline || baseline.trainingEventCount < minLogins) continue;

    const loginHour = new Date(evt.timestamp).getUTCHours();
    if (!baseline.knownHours.has(loginHour)) {
      alerts.push({
        id:          alertId(RULE_ID, evt.username, evt.timestamp),
        ruleId:      RULE_ID,
        username:    evt.username,
        timeStart:   evt.timestamp,
        timeEnd:     evt.timestamp,
        severity:    "medium",
        evidenceIds: [evt.id],
        explanation: `Suspicious indications: user "${evt.username}" logged in at hour ${loginHour} UTC, which is outside their established baseline login hours.`,
        details: { loginHour, knownHours: [...baseline.knownHours].sort((a, b) => a - b) },
      });
    }
  }

  return alerts;
}
