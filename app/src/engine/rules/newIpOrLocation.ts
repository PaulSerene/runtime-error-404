/**
 * Rule: RULE-NEW-SOURCE-IP
 * Detects logins from an IP and location that are both absent from the user's baseline.
 * Owner: Person A — No network access. No browser APIs.
 */
import type { Alert, LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { isSuppressed, alertId, detectionEvents } from "@/engine/rules/guards";
import { lookupLocation, parseIpLocationCsv } from "@/engine/ingest";
import type { ParsedIpLocation } from "@/engine/ingest";

export const RULE_ID = "RULE-NEW-SOURCE-IP";

export function newIpOrLocation(
  events: LogEvent[],
  baselines: BaselineMap,
  config: Config,
  ipLoc: Config["ipLocations"],
  _assets: Config["assets"],
): Alert[] {
  // Pre-parse ipLoc entries from Config (already structured as { cidr, location })
  // We need ParsedIpLocation with networkInt + maskBits — reuse parseIpLocationCsv
  // via a synthetic CSV, or directly convert.
  const parsedEntries: ParsedIpLocation[] = parseIpLocationCsv(
    ["cidr,location", ...ipLoc.map((e) => `${e.cidr},${e.location}`)].join("\n"),
  );

  const det = detectionEvents(events, config).filter(
    (e) =>
      !isSuppressed(e, config) &&
      e.username &&
      e.sourceIp &&
      e.result?.toUpperCase() === "SUCCESS",
  );

  const alerts: Alert[] = [];

  for (const evt of det) {
    const baseline = baselines.get(evt.username);
    // Require a non-empty baseline
    if (!baseline || baseline.noBaseline) continue;

    const ipKnown  = baseline.knownSourceIps.has(evt.sourceIp);
    if (ipKnown) continue; // IP is known — no alert

    // Resolve location
    const location = lookupLocation(evt.sourceIp, parsedEntries);

    // Check if the resolved location was seen in training (via known IPs in that location)
    // We do not store known locations separately; use the baseline knownSourceIps as proxy.
    // For a stricter check: alert only when *both* IP and location are new.
    // If no location resolved, treat as unknown location → alert.
    const locationKnown = location !== null &&
      [...baseline.knownSourceIps].some((knownIp) => {
        const knownLoc = lookupLocation(knownIp, parsedEntries);
        return knownLoc === location;
      });

    if (!locationKnown) {
      alerts.push({
        id:          alertId(RULE_ID, evt.username, evt.timestamp),
        ruleId:      RULE_ID,
        username:    evt.username,
        timeStart:   evt.timestamp,
        timeEnd:     evt.timestamp,
        severity:    "medium",
        evidenceIds: [evt.id],
        explanation: `Suspicious indications: user "${evt.username}" logged in from new IP ${evt.sourceIp}${location ? ` (${location})` : ""}, which is absent from their baseline.`,
        details: { sourceIp: evt.sourceIp, location },
      });
    }
  }

  return alerts;
}
