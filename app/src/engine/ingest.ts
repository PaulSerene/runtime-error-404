/**
 * CSV ingestion for Windows Security logs.
 * Owner: Person A (src/engine/, src/data/, tests/)
 *
 * Performance notes (Step 8):
 * - Events are sorted ONCE by timestamp after ingest; rules must NOT re-sort.
 * - PapaParse is invoked in streaming mode (step callback) so large CSVs are
 *   never fully materialised as a JS array before deduplication.
 * - Deduplication uses a Set<string> of FNV-1a hashes (not full row strings)
 *   to keep memory proportional to unique-row count, not raw byte count.
 *
 * Rules:
 * - No network access. No browser APIs.
 * - All timestamps normalised to ISO 8601 UTC.
 * - Invalid / unparseable rows go to IngestReport.invalidRows (no crash).
 * - Exact-duplicate rows are removed and counted.
 * - Stable per-row id = FNV-1a hash of the raw row string.
 */

import Papa from "papaparse";
import type { LogEvent, IngestReport, Config, ParseReport } from "@/types";
import { buildColumnMap, inspectCsvSchema } from "@/engine/ingest/columnMapper";
import { normalizeUsername, normalizeIp, isMachineAccount } from "@/engine/ingest/normalize";
import { parseTimestamp, buildParseReport } from "@/engine/ingest/timestampParser";

export { parseTimestamp, buildParseReport };
export type { ParseReport };

// ─── Result derivation & normalisation ───────────────────────────────────────

/**
 * Normalizes or derives the authentication result.
 * - If result is missing, derives it from eventType.
 * - Treats "Audit Success" / "Audit Failure" as SUCCESS / FAILURE.
 * - Treats hex status codes: 0x0 → SUCCESS, non-zero → FAILURE.
 */
export function normalizeResult(rawResult?: string | null, eventType?: string | null): string {
  const r = rawResult?.trim();
  const e = eventType?.trim();

  if (r) {
    const upper = r.toUpperCase();
    if (upper === "SUCCESS" || upper === "AUDIT SUCCESS" || upper === "STATUS_SUCCESS") return "SUCCESS";
    if (upper === "FAILURE" || upper === "FAILED" || upper === "AUDIT FAILURE" || upper.startsWith("STATUS_")) return "FAILURE";
    if (/^0x0+$/i.test(r) || r === "0") return "SUCCESS";
    if (/^0x[0-9a-f]+$/i.test(r)) return "FAILURE";
    if (upper.includes("SUCCESS")) return "SUCCESS";
    if (upper.includes("FAIL")) return "FAILURE";
    return r;
  }

  if (e) {
    if (e === "4624" || e.includes("4624")) return "SUCCESS";
    if (e === "4625" || e.includes("4625")) return "FAILURE";
  }

  return "";
}

// ─── Stable row ID (FNV-1a 32-bit) ──────────────────────────────────────────

export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
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

export function parseCidr(cidr: string): { networkInt: number; maskBits: number } | null {
  const m = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!m) return null;
  const bits = Number(m[2]);
  if (bits < 0 || bits > 32) return null;
  const networkInt = ipToInt(m[1]);
  if (networkInt === null) return null;
  return { networkInt, maskBits: bits };
}

export function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function ipInCidr(ip: string, entry: ParsedIpLocation): boolean {
  const addr = ipToInt(ip);
  if (addr === null) return false;
  const mask = maskBitsToInt(entry.maskBits);
  return (addr & mask) >>> 0 === (entry.networkInt & mask) >>> 0;
}

export function maskBitsToInt(bits: number): number {
  if (bits === 0) return 0;
  return (0xffffffff << (32 - bits)) >>> 0;
}

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
  parseReport: ParseReport;
  schemaMappings?: import("@/types").ColumnMappingInfo[];
}

/**
 * Ingests a CSV string and returns a sorted event list.
 *
 * Performance (Step 8):
 * - Streaming mode: PapaParse step() callback processes one row at a time;
 *   the full raw array is never allocated.
 * - Deduplication uses FNV-1a hashes (8-byte strings) rather than full row text.
 * - Events are sorted by timestamp ONCE here. Rules must rely on this order.
 */
export function ingestCsv(csvText: string, config: Config): IngestResult {
  const tz = config.timezone || "UTC";

  // ── Stream-parse: resolve headers first, then process row-by-row ──────────
  const invalidRows: IngestReport["invalidRows"] = [];
  const missingFieldCounts: Record<string, number> = {};
  const seenHashes = new Set<string>();   // hashes only — not full row text
  let duplicatesRemoved = 0;
  let totalRows = 0;

  const events: LogEvent[] = [];
  const sampleRows: Record<string, string>[] = [];

  // Capture headers on the first step call
  let colMap: Map<string, string> | null = null;
  let headers: string[] = [];

  Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    step(rowResult) {
      // Resolve column map once from the first row's meta
      if (colMap === null) {
        headers = rowResult.meta.fields ?? [];
        colMap = buildColumnMap(headers, {
          silent: true,
          overrides: config.columnOverrides,
        });
      }

      totalRows++;
      const row = rowResult.data;
      if (sampleRows.length < 5) {
        sampleRows.push({ ...row });
      }

      // Re-assemble raw row string for id / dedup
      const rawRow = headers.map((h) => row[h] ?? "").join(",");

      // ── Deduplication via hash ───────────────────────────────────────────
      const hash = fnv1a(rawRow);
      if (seenHashes.has(hash)) {
        duplicatesRemoved++;
        return;
      }
      seenHashes.add(hash);

      // ── Column lookup helper ─────────────────────────────────────────────
      const get = (canonical: string): string => {
        for (const [header, canon] of colMap!) {
          if (canon === canonical) {
            const v = row[header];
            if (v !== undefined && v.trim() !== "") return v.trim();
          }
        }
        return "";
      };

      const rawTs       = get("timestamp");
      const rawUsername = get("username");
      const rawIp       = get("sourceIp");
      const host        = get("host");
      const eventType   = get("eventType");
      const rawResult   = get("result");
      const rawLogon    = get("logonType");
      const eventId     = get("eventId") || undefined;
      const authProtocol = get("authProtocol") || undefined;
      const sourcePort  = get("sourcePort") || undefined;
      const destPort    = get("destPort") || undefined;
      const geoCity     = get("geoCity") || undefined;
      const geoCountry  = get("geoCountry") || undefined;
      const userAgent   = get("userAgent") || undefined;
      const subStatus   = get("subStatus") || undefined;

      // Skip machine accounts
      if (isMachineAccount(rawUsername)) return;

      // ── Timestamp validation ─────────────────────────────────────────────
      if (!rawTs) {
        invalidRows.push({ row: rawRow, reason: "Missing field: timestamp" });
        bump(missingFieldCounts, "timestamp");
        return;
      }
      const timestamp = parseTimestamp(rawTs, tz);
      if (!timestamp) {
        invalidRows.push({ row: rawRow, reason: `Unparseable timestamp: '${rawTs}'` });
        return;
      }

      const username = normalizeUsername(rawUsername) ?? "";
      const sourceIp = normalizeIp(rawIp) ?? "";
      const result   = normalizeResult(rawResult, eventType);
      const logonType = rawLogon ? rawLogon : null;

      if (!username)  bump(missingFieldCounts, "username");
      if (!sourceIp)  bump(missingFieldCounts, "sourceIp");
      if (!host)      bump(missingFieldCounts, "host");
      if (!eventType) bump(missingFieldCounts, "eventType");
      if (!result)    bump(missingFieldCounts, "result");
      if (logonType === null) bump(missingFieldCounts, "logonType");

      events.push({
        id: hash,
        timestamp,
        username,
        sourceIp,
        host,
        eventType,
        result,
        logonType,
        rawRow,
        flags: [],
        rawLineNumber: totalRows,
        eventId,
        authProtocol,
        sourcePort,
        destPort,
        geoCity,
        geoCountry,
        userAgent,
        subStatus,
      });
    },
  });

  // ── Sort ONCE by timestamp (Step 8) ──────────────────────────────────────
  // All rules depend on this order; they must NOT sort again internally.
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const schemaMappings = headers.length > 0
    ? inspectCsvSchema(headers, sampleRows, config.columnOverrides)
    : undefined;

  const parseReport = buildParseReport(totalRows, events.length, invalidRows);
  const report: IngestReport = {
    totalRows,
    validRows: events.length,
    invalidRows,
    duplicatesRemoved,
    missingFieldCounts,
    rejectedByReason: parseReport.rejectedByReason,
    parseReport,
  };

  return { events, report, parseReport, schemaMappings };
}

function bump(counter: Record<string, number>, key: string) {
  counter[key] = (counter[key] ?? 0) + 1;
}
