/**
 * Rule: RULE-IMPOSSIBLE-TRAVEL
 * Identifies implausible travel or rapid geographic shifts between consecutive
 * successful logins for the same account.
 *
 * Fully offline: relies on locally provided IP-location mapping table or
 * dataset geo columns (geoCity / geoCountry).
 */
import type { Alert, LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { isSuppressed, alertId, detectionEvents } from "@/engine/rules/guards";
import { lookupLocation, parseIpLocationCsv, type ParsedIpLocation } from "@/engine/ingest";

export const RULE_ID = "RULE-IMPOSSIBLE-TRAVEL";

export function resolveEventLocation(
  evt: LogEvent,
  parsedIpLoc: ParsedIpLocation[],
): string | null {
  if (evt.geoCity && evt.geoCountry) {
    return `${evt.geoCity}, ${evt.geoCountry}`;
  }
  if (evt.geoCity) return evt.geoCity;
  if (evt.geoCountry) return evt.geoCountry;
  if (evt.sourceIp && parsedIpLoc.length > 0) {
    return lookupLocation(evt.sourceIp, parsedIpLoc);
  }
  return null;
}

export function impossibleTravel(
  events: LogEvent[],
  _baselines: BaselineMap,
  config: Config,
  ipLoc: Config["ipLocations"],
  _assets: Config["assets"],
): Alert[] {
  const parsedEntries: ParsedIpLocation[] = parseIpLocationCsv(
    ["cidr,location", ...ipLoc.map((e) => `${e.cidr},${e.location}`)].join("\n"),
  );

  // Maximum time delta in hours for locations to be considered implausibly rapid (default 3 hours)
  const maxTravelHours = config.thresholds["impossibleTravelHours"] ?? 3;
  const maxTravelMs = maxTravelHours * 60 * 60 * 1000;

  const det = detectionEvents(events, config).filter(
    (e) =>
      !isSuppressed(e, config) &&
      e.username &&
      e.result?.toUpperCase() === "SUCCESS",
  );

  // Group by username
  const byUser = new Map<string, LogEvent[]>();
  for (const evt of det) {
    if (!byUser.has(evt.username)) byUser.set(evt.username, []);
    byUser.get(evt.username)!.push(evt);
  }

  const alerts: Alert[] = [];

  for (const [username, userEvents] of byUser) {
    // Only check events that have an identifiable location
    const withLocation: { event: LogEvent; location: string; timeMs: number }[] = [];
    for (const evt of userEvents) {
      const loc = resolveEventLocation(evt, parsedEntries);
      if (loc) {
        withLocation.push({
          event: evt,
          location: loc,
          timeMs: new Date(evt.timestamp).getTime(),
        });
      }
    }

    if (withLocation.length < 2) continue;

    for (let i = 0; i < withLocation.length - 1; i++) {
      const prev = withLocation[i];
      const curr = withLocation[i + 1];

      // If location changed between consecutive successful logins
      if (prev.location !== curr.location) {
        const deltaMs = curr.timeMs - prev.timeMs;
        if (deltaMs >= 0 && deltaMs <= maxTravelMs) {
          const deltaMinutes = Math.round(deltaMs / (60 * 1000));
          alerts.push({
            id: alertId(RULE_ID, username, curr.event.timestamp),
            ruleId: RULE_ID,
            username,
            timeStart: prev.event.timestamp,
            timeEnd: curr.event.timestamp,
            severity: "critical",
            evidenceIds: [prev.event.id, curr.event.id],
            explanation: `Suspicious indications: impossible travel detected for user "${username}". Consecutive logins from "${prev.location}" (${prev.event.sourceIp || "IP unknown"}) and "${curr.location}" (${curr.event.sourceIp || "IP unknown"}) occurred within ${deltaMinutes} minutes (threshold: ${maxTravelHours} hours).`,
            details: {
              previousLocation: prev.location,
              currentLocation: curr.location,
              previousIp: prev.event.sourceIp,
              currentIp: curr.event.sourceIp,
              deltaMinutes,
            },
          });
        }
      }
    }
  }

  return alerts;
}
