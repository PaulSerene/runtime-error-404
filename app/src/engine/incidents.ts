/**
 * Incident grouping.
 * Owner: Person A — No network access. No browser APIs.
 *
 * Groups alerts per user. Merges alerts whose timeStart falls within
 * thresholds.incidentWindowMinutes (default 60) of each other into one incident.
 */
import type { Alert, Incident, Config } from "@/types";
import { scoreIncident } from "@/engine/scoring";

export function groupIntoIncidents(
  alerts: Alert[],
  config: Config,
): Incident[] {
  const windowMs = (config.thresholds["incidentWindowMinutes"] ?? 60) * 60 * 1000;

  // Group alerts by username
  const byUser = new Map<string, Alert[]>();
  for (const alert of alerts) {
    if (!byUser.has(alert.username)) byUser.set(alert.username, []);
    byUser.get(alert.username)!.push(alert);
  }

  const incidents: Incident[] = [];
  let incidentIndex = 0;

  for (const [, userAlerts] of byUser) {
    // Sort alerts by timeStart
    const sorted = [...userAlerts].sort(
      (a, b) => new Date(a.timeStart).getTime() - new Date(b.timeStart).getTime(),
    );

    // Greedy merge: start a new group whenever the gap to the previous group's earliest start exceeds windowMs
    const groups: Alert[][] = [];
    let currentGroup: Alert[] = [];

    for (const alert of sorted) {
      if (currentGroup.length === 0) {
        currentGroup.push(alert);
      } else {
        const groupStart = new Date(currentGroup[0].timeStart).getTime();
        const alertStart = new Date(alert.timeStart).getTime();
        if (alertStart - groupStart <= windowMs) {
          currentGroup.push(alert);
        } else {
          groups.push(currentGroup);
          currentGroup = [alert];
        }
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    // Convert each group to an Incident via scoring
    for (const group of groups) {
      const id = `inc_${incidentIndex++}`;
      const incident = scoreIncident(id, group, config);
      incidents.push(incident);
    }
  }

  // Sort by score descending (highest risk first)
  incidents.sort((a, b) => b.score - a.score);

  return incidents;
}
