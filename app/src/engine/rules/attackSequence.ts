/**
 * Rule: RULE-ATTACK-SEQUENCE
 * Detects multi-stage attack chains:
 * Stage 1: Authentication failure burst (e.g. >= 2 failures)
 * Stage 2: Successful authentication for the same account
 * Stage 3: Follow-on access to a new destination host or lateral movement within a tight window.
 */
import type { Alert, LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { isSuppressed, alertId, detectionEvents } from "@/engine/rules/guards";

export const RULE_ID = "RULE-ATTACK-SEQUENCE";

export function attackSequence(
  events: LogEvent[],
  baselines: BaselineMap,
  config: Config,
  _ipLoc: Config["ipLocations"],
  _assets: Config["assets"],
): Alert[] {
  const sequenceWindowHours = config.thresholds["attackSequenceWindowHours"] ?? 4;
  const sequenceWindowMs = sequenceWindowHours * 60 * 60 * 1000;

  const det = detectionEvents(events, config).filter(
    (e) => !isSuppressed(e, config) && e.username,
  );

  // Group by username
  const byUser = new Map<string, LogEvent[]>();
  for (const evt of det) {
    if (!byUser.has(evt.username)) byUser.set(evt.username, []);
    byUser.get(evt.username)!.push(evt);
  }

  const alerts: Alert[] = [];

  for (const [username, userEvents] of byUser) {
    const baseline = baselines.get(username);
    const knownHosts = baseline?.knownHosts ?? new Set<string>();

    for (let i = 0; i < userEvents.length; i++) {
      const e1 = userEvents[i];
      if (e1.result !== "FAILURE") continue;

      const t1 = new Date(e1.timestamp).getTime();

      // Look for a burst of failures
      let failCount = 1;
      const failureEvidence: LogEvent[] = [e1];
      let k = i + 1;
      while (k < userEvents.length) {
        const next = userEvents[k];
        const nextTime = new Date(next.timestamp).getTime();
        if (nextTime - t1 > sequenceWindowMs) break;
        if (next.result === "FAILURE") {
          failCount++;
          failureEvidence.push(next);
        } else if (next.result === "SUCCESS") {
          // Found success! Check for follow-on new host access
          if (failCount >= 2) {
            const successEvt = next;
            const successTime = nextTime;

            // Look forward for new host access
            const newHostEvts: LogEvent[] = [];
            for (let m = k + 1; m < userEvents.length; m++) {
              const followOn = userEvents[m];
              const followTime = new Date(followOn.timestamp).getTime();
              if (followTime - successTime > sequenceWindowMs) break;

              if (followOn.host && !knownHosts.has(followOn.host)) {
                newHostEvts.push(followOn);
              }
            }

            // Or if the successful event itself was on an unfamiliar host
            if (successEvt.host && !knownHosts.has(successEvt.host)) {
              newHostEvts.push(successEvt);
            }

            if (newHostEvts.length > 0) {
              const distinctNewHosts = [...new Set(newHostEvts.map((e) => e.host))];
              const evidenceIds = [
                ...failureEvidence.map((e) => e.id),
                successEvt.id,
                ...newHostEvts.map((e) => e.id),
              ];
              // Unique evidence
              const uniqueEvidence = [...new Set(evidenceIds)];
              const timeStart = e1.timestamp;
              const timeEnd = newHostEvts[newHostEvts.length - 1].timestamp;

              alerts.push({
                id: alertId(RULE_ID, username, timeStart),
                ruleId: RULE_ID,
                username,
                timeStart,
                timeEnd,
                severity: "critical",
                evidenceIds: uniqueEvidence,
                explanation: `Suspicious indications: multi-stage attack sequence detected for "${username}". Sequence: ${failCount} failed login(s) → successful login (${successEvt.sourceIp || "unknown IP"}) → access to unfamiliar host(s) [${distinctNewHosts.join(", ")}] within ${sequenceWindowHours} hours.`,
                details: {
                  failCount,
                  successTimestamp: successEvt.timestamp,
                  newHosts: distinctNewHosts,
                  sequenceWindowHours,
                },
              });
              i = k; // advance loop
              break;
            }
          }
        }
        k++;
      }
    }
  }

  return alerts;
}
