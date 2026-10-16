/**
 * Shared guard utilities for all detection rules.
 * Owner: Person A
 * No network access. No browser APIs.
 */

import type { LogEvent, Config } from "@/types";
import { parseCidr, ipToInt, maskBitsToInt } from "@/engine/ingest";

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

/** Generate a UUID-ish alert id. Deterministic via inputs so tests are stable. */
export function alertId(ruleId: string, username: string, timeStart: string): string {
  // Simple hash: combine rule + user + time → 12-char hex
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
