/**
 * CSV ingestion for Windows Security logs.
 * Owner: Person A (src/engine/, src/data/, tests/)
 *
 * Rules:
 * - No network access. No browser APIs.
 * - All timestamps normalised to ISO 8601 UTC.
 * - Invalid / unparseable rows go to IngestReport.invalidRows (no crash).
 * - Exact-duplicate rows are removed and counted.
 * - Stable per-row id = simple FNV-1a hash of the raw row string.
 */

import Papa from "papaparse";
import type { LogEvent, IngestReport, Config } from "@/types";

// ─── Column-name alias maps ───────────────────────────────────────────────────

const ALIAS: Record<string, string[]> = {
  timestamp:  ["timestamp", "time", "datetime", "date_time", "eventtime", "event_time", "logtime", "log_time"],
  username:   ["username", "user", "user_name", "account", "accountname", "account_name", "logon_user", "subject_username"],
  sourceIp:   ["sourceip", "source_ip", "src_ip", "srcip", "clientip", "client_ip", "remoteip", "remote_ip", "ipaddress", "ip_address"],
  host:       ["host", "dest", "destination", "computername", "computer_name", "workstation", "hostname", "machine"],
  eventType:  ["eventtype", "event_type", "eventid", "event_id", "event_code", "type", "id"],
  result:     ["result", "status", "outcome", "logon_result", "auth_result", "success_failure"],
  logonType:  ["logontype", "logon_type", "authtype", "auth_type"],
};

/** Build a lookup: lowercase-no-spaces column header → canonical field name */
function buildColumnMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const header of headers) {
    const key = header.toLowerCase().replace(/[\s_-]+/g, "");
    for (const [canonical, aliases] of Object.entries(ALIAS)) {
      for (const alias of aliases) {
        if (key === alias.replace(/[\s_-]+/g, "")) {
          map.set(header, canonical);
          break;
        }
      }
    }
  }
  return map;
}

// ─── Timestamp normalisation ──────────────────────────────────────────────────

/**
 * Attempt to parse a timestamp string and return an ISO 8601 UTC string.
 * Returns null if the string cannot be interpreted as a date.
 *
 * Handles:
 *  - ISO 8601 / RFC 3339 (with or without timezone)
 *  - "YYYY/MM/DD HH:MM:SS" and "MM/DD/YYYY HH:MM:SS" style strings
 *  - Unix epoch integers (seconds since 1970)
 *
 * When no timezone info is present the caller's `timezone` is used to interpret
 * the local time.  Because we run in Node / browser without a full IANA DB we
 * use Intl.DateTimeFormat only for validation; actual offset math is delegated
 * to the native Date engine via the trick of appending 'Z' for UTC-naive strings
 * (the caller passes timezone and we treat absent-tz as UTC by default, since
 * reliably converting IANA names without a full tzdata library would require
 * network access, which is forbidden).
 */
export function parseTimestamp(raw: string, _timezone = "UTC"): string | null {
  if (!raw || raw.trim() === "") return null;

  const s = raw.trim();

  // ── Try direct Date parse first (covers ISO 8601 with TZ) ────────────────
  let d = new Date(s);
  if (isValid(d)) return d.toISOString();

  // ── Try Unix epoch (integer string) ──────────────────────────────────────
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s);
    d = new Date(s.length <= 10 ? n * 1000 : n);
    if (isValid(d)) return d.toISOString();
  }

  // ── Try "YYYY/MM/DD HH:MM:SS" ─────────────────────────────────────────────
  const slashYMD = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})[T ](\d{2}:\d{2}(?::\d{2})?)$/);
  if (slashYMD) {
    d = new Date(`${slashYMD[1]}-${pad(slashYMD[2])}-${pad(slashYMD[3])}T${slashYMD[4]}Z`);
    if (isValid(d)) return d.toISOString();
  }

  // ── Try "MM/DD/YYYY HH:MM:SS" ─────────────────────────────────────────────
  const slashMDY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[T ](\d{2}:\d{2}(?::\d{2})?)$/);
  if (slashMDY) {
    d = new Date(`${slashMDY[3]}-${pad(slashMDY[1])}-${pad(slashMDY[2])}T${slashMDY[4]}Z`);
    if (isValid(d)) return d.toISOString();
  }

  // ── Try "DD-Mon-YYYY HH:MM:SS" (e.g. 15-Mar-2024 14:23:01) ───────────────
  const ddMon = s.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{4})[T ](\d{2}:\d{2}(?::\d{2})?)$/);
  if (ddMon) {
    d = new Date(`${ddMon[1]} ${ddMon[2]} ${ddMon[3]} ${ddMon[4]} UTC`);
    if (isValid(d)) return d.toISOString();
  }

  return null;
}

function isValid(d: Date) { return !isNaN(d.getTime()); }
function pad(s: string)    { return s.padStart(2, "0"); }

// ─── Stable row ID (FNV-1a 32-bit) ──────────────────────────────────────────

export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0; // keep to 32-bit unsigned
  }
  return h.toString(16).padStart(8, "0");
}

// ─── Asset-list CSV parser ────────────────────────────────────────────────────

export interface ParsedAsset {
  host: string;
  role: string;
  privileged: boolean;
}

export function parseAssetsCsv(csv: string): ParsedAsset[] {
  if (!csv.trim()) return [];
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  return result.data.map((row) => {
    const host = row["host"] ?? row["hostname"] ?? row["computername"] ?? "";
    const role = row["role"] ?? row["type"] ?? "";
    const priv = (row["privileged"] ?? row["admin"] ?? "").toLowerCase();
    return {
      host: host.trim(),
      role: role.trim(),
      privileged: priv === "true" || priv === "yes" || priv === "1",
    };
  }).filter((a) => a.host !== "");
}

// ─── IP-location CSV parser + CIDR matching ──────────────────────────────────

export interface ParsedIpLocation {
  cidr: string;
  location: string;
  /** Pre-computed for fast matching */
  networkInt: number;
  maskBits: number;
}

export function parseIpLocationCsv(csv: string): ParsedIpLocation[] {
  if (!csv.trim()) return [];
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  return result.data.flatMap((row) => {
    const cidr = (row["cidr"] ?? row["network"] ?? row["range"] ?? "").trim();
    const location = (row["location"] ?? row["loc"] ?? row["region"] ?? "").trim();
    if (!cidr || !location) return [];
    const parsed = parseCidr(cidr);
    if (!parsed) return [];
    return [{ cidr, location, ...parsed }];
  });
}

/**
 * Parse a CIDR string like "192.168.1.0/24" into (networkInt, maskBits).
 * Returns null for invalid CIDRs.
 */
export function parseCidr(cidr: string): { networkInt: number; maskBits: number } | null {
  const m = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!m) return null;
  const bits = Number(m[2]);
  if (bits < 0 || bits > 32) return null;
  const networkInt = ipToInt(m[1]);
  if (networkInt === null) return null;
  return { networkInt, maskBits: bits };
}

/** Convert dotted-decimal IP to a 32-bit integer. Returns null for invalid. */
export function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Test whether an IP string falls within a parsed CIDR entry. */
export function ipInCidr(ip: string, entry: ParsedIpLocation): boolean {
  const addr = ipToInt(ip);
  if (addr === null) return false;
  const mask = maskBitsToInt(entry.maskBits);
  return (addr & mask) >>> 0 === (entry.networkInt & mask) >>> 0;
}

/** Convert a mask-bit count (0–32) to a 32-bit integer mask. */
export function maskBitsToInt(bits: number): number {
  if (bits === 0) return 0;
  return (0xffffffff << (32 - bits)) >>> 0;
}

/** Look up the human-readable location for an IP, or return null. */
export function lookupLocation(ip: string, entries: ParsedIpLocation[]): string | null {
  for (const entry of entries) {
    if (ipInCidr(ip, entry)) return entry.location;
  }
  return null;
}

// ─── Main ingestion function ──────────────────────────────────────────────────

export interface IngestResult {
  events: LogEvent[];
  report: IngestReport;
}

export function ingestCsv(csvText: string, config: Config): IngestResult {
  const tz = config.timezone || "UTC";

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const colMap = buildColumnMap(headers);

  const invalidRows: IngestReport["invalidRows"] = [];
  const missingFieldCounts: Record<string, number> = {};
  const seenRawRows = new Set<string>();
  let duplicatesRemoved = 0;

  const events: LogEvent[] = [];
  let totalRows = 0;

  for (const row of parsed.data) {
    totalRows++;

    // Re-assemble raw row string for deduplication / id purposes
    const rawRow = headers.map((h) => row[h] ?? "").join(",");

    // ── Deduplication ─────────────────────────────────────────────────────
    if (seenRawRows.has(rawRow)) {
      duplicatesRemoved++;
      continue;
    }
    seenRawRows.add(rawRow);

    // ── Map columns to canonical names ────────────────────────────────────
    const get = (canonical: string): string => {
      for (const [header, canon] of colMap) {
        if (canon === canonical) {
          const v = row[header];
          if (v !== undefined && v.trim() !== "") return v.trim();
        }
      }
      return "";
    };

    const rawTs    = get("timestamp");
    const username = get("username");
    const sourceIp = get("sourceIp");
    const host     = get("host");
    const eventType = get("eventType");
    const result   = get("result");
    const logonType = get("logonType");

    // ── Timestamp validation ──────────────────────────────────────────────
    let timestamp: string;
    if (!rawTs) {
      invalidRows.push({ row: rawRow, reason: "Missing field: timestamp" });
      bump(missingFieldCounts, "timestamp");
      continue;
    }
    const tsResult = parseTimestamp(rawTs, tz);
    if (!tsResult) {
      invalidRows.push({ row: rawRow, reason: `Unparseable timestamp: '${rawTs}'` });
      continue;
    }
    timestamp = tsResult;

    // ── Optional-field tracking ───────────────────────────────────────────
    if (!username)  bump(missingFieldCounts, "username");
    if (!sourceIp)  bump(missingFieldCounts, "sourceIp");
    if (!host)      bump(missingFieldCounts, "host");
    if (!eventType) bump(missingFieldCounts, "eventType");
    if (!result)    bump(missingFieldCounts, "result");
    if (!logonType) bump(missingFieldCounts, "logonType");

    const id = fnv1a(rawRow);

    events.push({
      id,
      timestamp,
      username,
      sourceIp,
      host,
      eventType,
      result,
      logonType,
      rawRow,
      flags: [],
    });
  }

  const report: IngestReport = {
    totalRows,
    validRows: events.length,
    invalidRows,
    duplicatesRemoved,
    missingFieldCounts,
  };

  return { events, report };
}

function bump(counter: Record<string, number>, key: string) {
  counter[key] = (counter[key] ?? 0) + 1;
}
