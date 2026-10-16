/**
 * Shared guard utilities for all detection rules.
 * Owner: Person A
 * No network access. No browser APIs.
 */

import type { LogEvent, Config } from "@/types";
import { parseCidr, ipToInt, maskBitsToInt } from "@/engine/ingest";

// ─── Field names that can be declared as required ─────────────────────────────

/** Every field on LogEvent that a rule might declare as required. */
export type RequiredField = keyof Pick<
  LogEvent,
  "username" | "sourceIp" | "host" | "eventType" | "result" | "logonType"
>;

// ─── Per-rule required-field declarations ─────────────────────────────────────

/**
 * Declares which LogEvent fields each rule needs to operate correctly.
 * If the dataset is missing any of these (i.e. every event has an empty
 * string / null for that field), the rule runner will skip the rule entirely
 * and record a "skipped: missing <field>" entry in the analysis report.
 *
 * Add an entry here whenever a new rule is introduced.
 */
export const RULE_REQUIRED_FIELDS: Readonly<Record<string, readonly RequiredField[]>> = {
  "RULE-BRUTE-FORCE":        ["username", "result"],
  "RULE-FAILURE-THEN-SUCCESS": ["username", "sourceIp", "result"],
  "RULE-PASSWORD-SPRAY":     ["sourceIp", "username", "result"],
  "RULE-OFF-HOURS":          ["username", "result"],
  "RULE-NEW-SOURCE-IP":      ["username", "sourceIp", "result"],
  "RULE-LATERAL-MOVEMENT":   ["username", "host"],
} as const;

// ─── Skip record ──────────────────────────────────────────────────────────────

/** Produced when a rule is skipped because a required field is absent. */
export interface RuleSkip {
  ruleId: string;
  reason: string; // e.g. "skipped: missing sourceIp"
}

// ─── Field-presence check ─────────────────────────────────────────────────────

/**
 * Returns the first required field that is effectively absent from the dataset,
 * or `null` if all required fields are present on at least one event.
 *
 * "Absent" means every event in the dataset has an empty string or null for
 * that field.  A partially-populated field (some events have it, some don't)
 * is still considered present — individual rules already handle per-event
 * missing values via their own `.filter()` guards.
 */
export function findMissingField(
  events: LogEvent[],
  fields: readonly RequiredField[],
): RequiredField | null {
  if (events.length === 0) return null; // nothing to check against
  for (const field of fields) {
    const presentOnAny = events.some((e) => {
      const v = e[field];
      return v !== null && v !== undefined && String(v).trim() !== "";
    });
    if (!presentOnAny) return field;
  }
  return null;
}

/**
 * Checks whether a rule should be skipped given the current dataset.
 *
 * @returns A `RuleSkip` record if the rule must be skipped, or `null` if it
 *          may proceed.
 */
export function checkRequiredFields(
  ruleId: string,
  events: LogEvent[],
): RuleSkip | null {
  const required = RULE_REQUIRED_FIELDS[ruleId];
  if (!required || required.length === 0) return null;

  const missing = findMissingField(events, required);
  if (missing === null) return null;

  return {
    ruleId,
    reason: `skipped: missing ${missing}`,
  };
}

// ─── Suppression guards ───────────────────────────────────────────────────────

/** Returns true if the event falls within any declared maintenance window. */
export function inMaintenanceWindow(evt: LogEvent, config: Config): boolean {
  const ts = new Date(evt.timestamp).getTime();
  return config.maintenanceWindows.some((w) => {
    const s = new Date(w.start).getTime();
    const e = new Date(w.end).getTime();
    return ts >= s && ts <= e;
  });
}

/** Returns true if the event's username is in approvedAccounts. */
export function isApprovedAccount(evt: LogEvent, config: Config): boolean {
  return config.approvedAccounts.includes(evt.username);
}

/** Returns true if the event's sourceIp falls inside any VPN CIDR. */
export function isVpnIp(ip: string, vpnCidrs: string[]): boolean {
  const addr = ipToInt(ip);
  if (addr === null) return false;
  for (const cidr of vpnCidrs) {
    const parsed = parseCidr(cidr);
    if (!parsed) continue;
    const mask = maskBitsToInt(parsed.maskBits);
    if ((addr & mask) >>> 0 === (parsed.networkInt & mask) >>> 0) return true;
  }
  return false;
}

/**
 * Returns true if any suppression condition applies to this event.
 * Rules must call this and skip the event if it returns true.
 */
export function isSuppressed(evt: LogEvent, config: Config): boolean {
  return (
    inMaintenanceWindow(evt, config) ||
    isApprovedAccount(evt, config) ||
    isVpnIp(evt.sourceIp, config.vpnCidrs)
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Generate a UUID-ish alert id. Deterministic via inputs so tests are stable. */
export function alertId(ruleId: string, username: string, timeStart: string): string {
  const s = `${ruleId}:${username}:${timeStart}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return `alert_${h.toString(16).padStart(8, "0")}`;
}

/** Filter events to only those in the detection window (after trainingPeriod.end). */
export function detectionEvents(events: LogEvent[], config: Config): LogEvent[] {
  const trainEnd = new Date(config.trainingPeriod.end).getTime();
  return events.filter((e) => new Date(e.timestamp).getTime() > trainEnd);
}
