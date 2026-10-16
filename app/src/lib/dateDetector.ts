/**
 * Timestamp Detection, Range Calculation, Timezone Normalization,
 * Dataset Fingerprinting, and Browser Storage for Baseline Calibration.
 */

import Papa from "papaparse";
import { resolveColumnMap } from "@/engine/ingest/columnMapper";
import { parseTimestamp } from "@/engine/ingest/timestampParser";

export type FileRole = "log" | "assets" | "ipLocation";

export interface FileDetectionReport {
  role: FileRole;
  roleLabel: string;
  fileName: string;
  timestampColumn: string | null;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  ambiguousCount: number;
  earliestIso: string | null;
  latestIso: string | null;
  earliestDisplay: string | null;
  latestDisplay: string | null;
  status: "success" | "no_column" | "no_valid_timestamps";
  warnings: string[];
  sampleInvalidValues: string[];
}

export interface OverallDetectionResult {
  hasAnyValidTimestamps: boolean;
  overallEarliestIso: string | null;
  overallLatestIso: string | null;
  overallEarliestDateInput: string; // "YYYY-MM-DD" in selected timezone
  overallLatestDateInput: string;   // "YYYY-MM-DD" in selected timezone
  overallEarliestDisplay: string;   // Formatted for UI
  overallLatestDisplay: string;     // Formatted for UI
  timezone: string;
  totalRows: number;
  totalValid: number;
  totalInvalid: number;
  totalAmbiguous: number;
  fileReports: FileDetectionReport[];
  generalWarnings: string[];
}

export interface InputCsvFile {
  role: FileRole;
  fileName: string;
  content: string;
}

export const ROLE_LABELS: Record<FileRole, string> = {
  log: "Windows Security Log",
  assets: "Host Assets Catalog",
  ipLocation: "IP Geolocation CIDR",
};

/**
 * Format an ISO 8601 UTC string into a "YYYY-MM-DD" string in the target timezone.
 * Suitable for HTML `<input type="date">`.
 */
export function formatIsoToDateInput(iso: string, timezone = "UTC"): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Format an ISO 8601 UTC string into a readable human display string in the target timezone.
 */
export function formatIsoToDisplay(iso: string, timezone = "UTC"): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
    return formatter.format(d);
  } catch {
    return iso;
  }
}

/**
 * Checks if a date string is ambiguous (e.g. 05/06/2024 where day and month are both <= 12).
 */
export function isAmbiguousDate(raw: string): boolean {
  if (!raw) return false;
  const s = raw.trim();
  const m = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
  if (!m) return false;
  const p1 = parseInt(m[1], 10);
  const p2 = parseInt(m[2], 10);
  return p1 <= 12 && p2 <= 12 && p1 !== p2;
}

/**
 * Analyzes a single CSV file string to discover its timestamp column,
 * parse timestamps, and calculate min/max dates.
 */
export function detectFileTimestamps(
  input: InputCsvFile,
  timezone = "UTC"
): FileDetectionReport {
  const { role, fileName, content } = input;
  const roleLabel = ROLE_LABELS[role] ?? role;
  const warnings: string[] = [];
  const sampleInvalidValues: string[] = [];

  if (!content.trim()) {
    return {
      role,
      roleLabel,
      fileName,
      timestampColumn: null,
      totalRows: 0,
      validCount: 0,
      invalidCount: 0,
      ambiguousCount: 0,
      earliestIso: null,
      latestIso: null,
      earliestDisplay: null,
      latestDisplay: null,
      status: "no_column",
      warnings: ["File is empty."],
      sampleInvalidValues: [],
    };
  }

  // Parse CSV with PapaParse to extract headers and rows
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  const headers = parsed.meta.fields ?? [];
  const columnMapResult = resolveColumnMap(headers, { silent: true });
  const timestampColumn = columnMapResult.fieldToColumn.get("timestamp") ?? null;

  if (!timestampColumn) {
    return {
      role,
      roleLabel,
      fileName,
      timestampColumn: null,
      totalRows: parsed.data.length,
      validCount: 0,
      invalidCount: 0,
      ambiguousCount: 0,
      earliestIso: null,
      latestIso: null,
      earliestDisplay: null,
      latestDisplay: null,
      status: "no_column",
      warnings: [
        `Excluded from date calculation: No recognizable timestamp column found. Looked for headers matching: timestamp, datetime, date, time, event_time, timecreated, systemtime, etc. Headers found: [${headers.join(", ")}].`,
      ],
      sampleInvalidValues: [],
    };
  }

  let validCount = 0;
  let invalidCount = 0;
  let ambiguousCount = 0;
  let minEpoch = Infinity;
  let maxEpoch = -Infinity;

  for (const row of parsed.data) {
    const rawVal = row[timestampColumn];
    if (rawVal === undefined || rawVal === null || rawVal.trim() === "") {
      // Row is empty or missing timestamp
      continue;
    }

    const trimmed = rawVal.trim();
    if (isAmbiguousDate(trimmed)) {
      ambiguousCount++;
    }

    const iso = parseTimestamp(trimmed, timezone);
    if (iso) {
      const epoch = new Date(iso).getTime();
      if (!isNaN(epoch)) {
        validCount++;
        if (epoch < minEpoch) minEpoch = epoch;
        if (epoch > maxEpoch) maxEpoch = epoch;
      } else {
        invalidCount++;
        if (sampleInvalidValues.length < 3 && !sampleInvalidValues.includes(trimmed)) {
          sampleInvalidValues.push(trimmed);
        }
      }
    } else {
      invalidCount++;
      if (sampleInvalidValues.length < 3 && !sampleInvalidValues.includes(trimmed)) {
        sampleInvalidValues.push(trimmed);
      }
    }
  }

  if (invalidCount > 0) {
    warnings.push(
      `Found ${invalidCount} invalid or unparseable timestamp value(s)${
        sampleInvalidValues.length > 0 ? ` (e.g. '${sampleInvalidValues.join("', '")}')` : ""
      }. These rows were ignored for date range calculation.`
    );
  }

  if (ambiguousCount > 0) {
    warnings.push(
      `Found ${ambiguousCount} row(s) with potentially ambiguous date formatting (day and month both ≤ 12). Values were parsed according to standard format precedence.`
    );
  }

  if (validCount === 0) {
    warnings.push(
      `Timestamp column '${timestampColumn}' was recognized, but no valid timestamps could be parsed.`
    );
    return {
      role,
      roleLabel,
      fileName,
      timestampColumn,
      totalRows: parsed.data.length,
      validCount: 0,
      invalidCount,
      ambiguousCount,
      earliestIso: null,
      latestIso: null,
      earliestDisplay: null,
      latestDisplay: null,
      status: "no_valid_timestamps",
      warnings,
      sampleInvalidValues,
    };
  }

  const earliestIso = new Date(minEpoch).toISOString();
  const latestIso = new Date(maxEpoch).toISOString();

  return {
    role,
    roleLabel,
    fileName,
    timestampColumn,
    totalRows: parsed.data.length,
    validCount,
    invalidCount,
    ambiguousCount,
    earliestIso,
    latestIso,
    earliestDisplay: formatIsoToDisplay(earliestIso, timezone),
    latestDisplay: formatIsoToDisplay(latestIso, timezone),
    status: "success",
    warnings,
    sampleInvalidValues,
  };
}

/**
 * Detects earliest and latest timestamps across all provided CSV files.
 */
export function detectDateRangeFromFiles(
  files: InputCsvFile[],
  timezone = "UTC"
): OverallDetectionResult {
  const fileReports: FileDetectionReport[] = [];
  const generalWarnings: string[] = [];

  let overallMinEpoch = Infinity;
  let overallMaxEpoch = -Infinity;
  let totalRows = 0;
  let totalValid = 0;
  let totalInvalid = 0;
  let totalAmbiguous = 0;

  for (const f of files) {
    const report = detectFileTimestamps(f, timezone);
    fileReports.push(report);
    totalRows += report.totalRows;
    totalValid += report.validCount;
    totalInvalid += report.invalidCount;
    totalAmbiguous += report.ambiguousCount;

    if (report.status === "success" && report.earliestIso && report.latestIso) {
      const eEpoch = new Date(report.earliestIso).getTime();
      const lEpoch = new Date(report.latestIso).getTime();
      if (eEpoch < overallMinEpoch) overallMinEpoch = eEpoch;
      if (lEpoch > overallMaxEpoch) overallMaxEpoch = lEpoch;
    }
  }

  const hasAnyValidTimestamps = isFinite(overallMinEpoch) && isFinite(overallMaxEpoch);

  let overallEarliestIso: string | null = null;
  let overallLatestIso: string | null = null;
  let overallEarliestDateInput = "";
  let overallLatestDateInput = "";
  let overallEarliestDisplay = "";
  let overallLatestDisplay = "";

  if (hasAnyValidTimestamps) {
    overallEarliestIso = new Date(overallMinEpoch).toISOString();
    overallLatestIso = new Date(overallMaxEpoch).toISOString();
    overallEarliestDateInput = formatIsoToDateInput(overallEarliestIso, timezone);
    overallLatestDateInput = formatIsoToDateInput(overallLatestIso, timezone);
    overallEarliestDisplay = formatIsoToDisplay(overallEarliestIso, timezone);
    overallLatestDisplay = formatIsoToDisplay(overallLatestIso, timezone);
  } else {
    generalWarnings.push(
      "No valid timestamps were found in any uploaded CSV files. Please verify your file contents or enter baseline dates manually."
    );
  }

  return {
    hasAnyValidTimestamps,
    overallEarliestIso,
    overallLatestIso,
    overallEarliestDateInput,
    overallLatestDateInput,
    overallEarliestDisplay,
    overallLatestDisplay,
    timezone,
    totalRows,
    totalValid,
    totalInvalid,
    totalAmbiguous,
    fileReports,
    generalWarnings,
  };
}

// ─── Dataset Fingerprinting (Cryptographic SHA-256) ─────────────────────────

function simpleHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Computes a SHA-256 hash string for an input text or Uint8Array.
 * Uses Web Crypto (subtle) if available, with a deterministic fallback.
 */
export async function sha256Hex(content: string): Promise<string> {
  try {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const hashBuf = await cryptoObj.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // Fallback if subtle is blocked or disabled
  }
  return simpleHash(content);
}

/**
 * Computes a unique dataset fingerprint considering:
 * - Content of each uploaded file
 * - CSV headers of each file
 * - File roles (log, assets, ipLocation)
 * File names do not affect the fingerprint so renaming a file preserves its saved dates.
 */
export async function computeDatasetFingerprint(
  files: { role: FileRole; content: string }[]
): Promise<string> {
  const present = files.filter((f) => f.content.trim().length > 0);
  if (present.length === 0) return "";

  // Sort by fixed role order for stability
  const roleOrder: Record<FileRole, number> = { log: 1, assets: 2, ipLocation: 3 };
  present.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  const components: string[] = [];
  for (const item of present) {
    const firstLine = item.content.split(/\r?\n/)[0]?.trim() ?? "";
    const contentHash = await sha256Hex(item.content);
    components.push(`role:${item.role}|headers:${firstLine}|hash:${contentHash}`);
  }

  const combined = components.join(";");
  const finalHash = await sha256Hex(combined);
  return `ds_${finalHash.slice(0, 32)}`;
}

// ─── Browser Storage (localStorage) Persistence ─────────────────────────────

const STORAGE_KEY = "vanguard_soc_baseline_dates_v1";

export interface SavedBaselineDates {
  fingerprint: string;
  trainingStart: string; // YYYY-MM-DD
  trainingEnd: string;   // YYYY-MM-DD
  timezone: string;
  savedAt: string;       // ISO 8601
  detectedMinIso?: string | null;
  detectedMaxIso?: string | null;
}

interface StorageSchema {
  byFingerprint: Record<string, SavedBaselineDates>;
  lastSaved?: SavedBaselineDates;
}

function getStorageSafe(): StorageSchema {
  if (typeof window === "undefined" || !window.localStorage) {
    return { byFingerprint: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byFingerprint: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.byFingerprint) {
      return parsed as StorageSchema;
    }
    return { byFingerprint: {} };
  } catch {
    return { byFingerprint: {} };
  }
}

function setStorageSafe(data: StorageSchema): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota or access errors gracefully
  }
}

/**
 * Saves confirmed baseline dates for a specific dataset fingerprint.
 */
export function saveConfirmedBaseline(
  fingerprint: string,
  dates: {
    trainingStart: string;
    trainingEnd: string;
    timezone: string;
    detectedMinIso?: string | null;
    detectedMaxIso?: string | null;
  }
): void {
  if (!fingerprint) return;
  const store = getStorageSafe();
  const entry: SavedBaselineDates = {
    fingerprint,
    trainingStart: dates.trainingStart,
    trainingEnd: dates.trainingEnd,
    timezone: dates.timezone,
    savedAt: new Date().toISOString(),
    detectedMinIso: dates.detectedMinIso ?? null,
    detectedMaxIso: dates.detectedMaxIso ?? null,
  };
  store.byFingerprint[fingerprint] = entry;
  store.lastSaved = entry;
  setStorageSafe(store);
}

/**
 * Retrieves confirmed baseline dates for a specific dataset fingerprint.
 */
export function getConfirmedBaseline(fingerprint: string): SavedBaselineDates | null {
  if (!fingerprint) return null;
  const store = getStorageSafe();
  return store.byFingerprint[fingerprint] ?? null;
}

/**
 * Retrieves the most recently saved baseline dates from any session.
 */
export function getLastSavedBaseline(): SavedBaselineDates | null {
  const store = getStorageSafe();
  return store.lastSaved ?? null;
}

/**
 * Removes saved dates for a specific dataset fingerprint.
 */
export function clearConfirmedBaseline(fingerprint: string): void {
  if (!fingerprint) return;
  const store = getStorageSafe();
  delete store.byFingerprint[fingerprint];
  if (store.lastSaved?.fingerprint === fingerprint) {
    delete store.lastSaved;
  }
  setStorageSafe(store);
}
