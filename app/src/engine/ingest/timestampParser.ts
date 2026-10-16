/**
 * High-performance, robust timestamp parser for log ingestion.
 *
 * Supported formats (tried in order):
 * 1. Unix epoch (seconds, milliseconds, microseconds, nanoseconds - detected by digit count)
 * 2. ISO 8601 / RFC 3339 (with or without sub-seconds, with or without timezone offsets)
 * 3. YYYY/MM/DD [HH:MM[:SS]] (with optional timezone offset)
 * 4. MM/DD/YYYY [HH:MM[:SS]] (US format, optional 12-hour AM/PM and timezone offset)
 * 5. DD/MM/YYYY or DD.MM.YYYY (International format, optional 12-hour AM/PM)
 * 6. DD-Mon-YYYY (e.g. 15-Mar-2024 14:23:01, optional timezone offset)
 * 7. Fallback standard Date.parse
 */

import type { InvalidRow } from "@/types";

export interface ParseReport {
  totalRows: number;
  validRows: number;
  rejectedCount: number;
  rejectedByReason: Record<string, number>;
  invalidRows: InvalidRow[];
}

const MONTH_NAMES: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function pad(val: string | number, len = 2): string {
  return String(val).padStart(len, "0");
}

function isValidDate(d: Date): boolean {
  if (isNaN(d.getTime())) return false;
  const yr = d.getUTCFullYear();
  return yr >= 1970 && yr <= 2100;
}

function formatOffset(rawOffset?: string): string {
  if (!rawOffset || rawOffset.toUpperCase() === "Z" || rawOffset.toUpperCase() === "UTC") {
    return "Z";
  }
  const match = rawOffset.match(/^([+-])(\d{1,2}):?(\d{2})?$/);
  if (!match) return "Z";
  const sign = match[1];
  const hours = pad(match[2]);
  const minutes = pad(match[3] ?? "00");
  return `${sign}${hours}:${minutes}`;
}

function adjust12Hour(hourStr: string, ampm?: string): string {
  let h = parseInt(hourStr, 10);
  if (!ampm) return pad(h);
  const upper = ampm.toUpperCase();
  if (upper === "AM") {
    if (h === 12) h = 0;
  } else if (upper === "PM") {
    if (h < 12) h += 12;
  }
  return pad(h);
}

function validateComponents(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  sec: number
): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour < 0 || hour > 23) return false;
  if (min < 0 || min > 59) return false;
  if (sec < 0 || sec > 59) return false;
  return true;
}

/**
 * Attempts to parse a raw timestamp string into an ISO 8601 UTC string.
 * Returns null if the timestamp cannot be parsed into a valid date.
 */
export function parseTimestamp(raw: string, _timezone = "UTC"): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // ── Format 1: Unix Epoch (detected by digit count) ─────────────────────────
  const epochMatch = s.match(/^(\d{9,19})(?:\.(\d+))?$/);
  if (epochMatch) {
    const intDigits = epochMatch[1].length;
    const fullNumber = Number(s);
    let ms: number;

    if (intDigits <= 10) {
      // 9-10 digits: epoch seconds
      ms = Math.round(fullNumber * 1000);
    } else if (intDigits <= 13) {
      // 11-13 digits: epoch milliseconds
      ms = Math.round(fullNumber);
    } else if (intDigits <= 16) {
      // 14-16 digits: epoch microseconds
      ms = Math.round(fullNumber / 1000);
    } else {
      // 17-19 digits: epoch nanoseconds
      ms = Math.round(fullNumber / 1000000);
    }

    const d = new Date(ms);
    if (isValidDate(d)) return d.toISOString();
  }

  // ── Format 2: ISO 8601 / RFC 3339 (YYYY-MM-DD[T ]HH:MM[:SS][.mmm][TZ]) ───
  const isoMatch = s.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?\s*(Z|[+-]\d{1,2}(?::?\d{2})?)?$/i
  );
  if (isoMatch) {
    const [, yr, mo, da, hr, mn, sc, msPart, tzPart] = isoMatch;
    const y = parseInt(yr, 10);
    const m = parseInt(mo, 10);
    const d = parseInt(da, 10);
    const h = parseInt(hr, 10);
    const min = parseInt(mn, 10);
    const sVal = sc ? parseInt(sc, 10) : 0;

    if (validateComponents(y, m, d, h, min, sVal)) {
      const msStr = msPart ? `.${msPart.slice(0, 3).padEnd(3, "0")}` : ".000";
      const tzStr = formatOffset(tzPart);
      const iso = `${yr}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(sVal)}${msStr}${tzStr}`;
      const parsed = new Date(iso);
      if (isValidDate(parsed)) return parsed.toISOString();
    }
  }

  // ── Format 3: YYYY/MM/DD[T ]HH:MM[:SS][.mmm][TZ] ──────────────────────────
  const slashYmdMatch = s.match(
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?\s*(Z|[+-]\d{1,2}(?::?\d{2})?)?$/i
  );
  if (slashYmdMatch) {
    const [, yr, mo, da, hr, mn, sc, msPart, tzPart] = slashYmdMatch;
    const y = parseInt(yr, 10);
    const m = parseInt(mo, 10);
    const d = parseInt(da, 10);
    const h = parseInt(hr, 10);
    const min = parseInt(mn, 10);
    const sVal = sc ? parseInt(sc, 10) : 0;

    if (validateComponents(y, m, d, h, min, sVal)) {
      const msStr = msPart ? `.${msPart.slice(0, 3).padEnd(3, "0")}` : ".000";
      const tzStr = formatOffset(tzPart);
      const iso = `${yr}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(sVal)}${msStr}${tzStr}`;
      const parsed = new Date(iso);
      if (isValidDate(parsed)) return parsed.toISOString();
    }
  }

  // ── Format 4: MM/DD/YYYY[T ]HH:MM[:SS] [AM|PM] [TZ] (US Slash MDY) ─────────
  const slashMdyMatch = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?\s*(AM|PM|am|pm)?\s*(Z|[+-]\d{1,2}(?::?\d{2})?)?$/i
  );
  if (slashMdyMatch) {
    const [, mo, da, yr, hr, mn, sc, msPart, ampm, tzPart] = slashMdyMatch;
    const y = parseInt(yr, 10);
    const m = parseInt(mo, 10);
    const d = parseInt(da, 10);
    const adjHr = adjust12Hour(hr, ampm);
    const h = parseInt(adjHr, 10);
    const min = parseInt(mn, 10);
    const sVal = sc ? parseInt(sc, 10) : 0;

    if (validateComponents(y, m, d, h, min, sVal)) {
      const msStr = msPart ? `.${msPart.slice(0, 3).padEnd(3, "0")}` : ".000";
      const tzStr = formatOffset(tzPart);
      const iso = `${yr}-${pad(m)}-${pad(d)}T${adjHr}:${pad(min)}:${pad(sVal)}${msStr}${tzStr}`;
      const parsed = new Date(iso);
      if (isValidDate(parsed)) return parsed.toISOString();
    }
  }

  // ── Format 5: DD/MM/YYYY or DD.MM.YYYY (International format) ─────────────
  const intlMatch = s.match(
    /^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?\s*(AM|PM|am|pm)?\s*(Z|[+-]\d{1,2}(?::?\d{2})?)?$/i
  );
  if (intlMatch) {
    const [, da, mo, yr, hr, mn, sc, msPart, ampm, tzPart] = intlMatch;
    const y = parseInt(yr, 10);
    const d = parseInt(da, 10);
    const m = parseInt(mo, 10);
    const adjHr = adjust12Hour(hr, ampm);
    const h = parseInt(adjHr, 10);
    const min = parseInt(mn, 10);
    const sVal = sc ? parseInt(sc, 10) : 0;

    if (validateComponents(y, m, d, h, min, sVal)) {
      const msStr = msPart ? `.${msPart.slice(0, 3).padEnd(3, "0")}` : ".000";
      const tzStr = formatOffset(tzPart);
      const iso = `${yr}-${pad(m)}-${pad(d)}T${adjHr}:${pad(min)}:${pad(sVal)}${msStr}${tzStr}`;
      const parsed = new Date(iso);
      if (isValidDate(parsed)) return parsed.toISOString();
    }
  }

  // ── Format 6: DD-Mon-YYYY (e.g. 15-Mar-2024 14:23:01) ──────────────────────
  const ddMonMatch = s.match(
    /^(\d{1,2})[-\/ ]([A-Za-z]{3})[-\/ ](\d{4})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?\s*(AM|PM|am|pm)?\s*(Z|[+-]\d{1,2}(?::?\d{2})?)?$/i
  );
  if (ddMonMatch) {
    const [, da, monStr, yr, hr, mn, sc, msPart, ampm, tzPart] = ddMonMatch;
    const mo = MONTH_NAMES[monStr.toLowerCase()];
    if (mo) {
      const y = parseInt(yr, 10);
      const m = parseInt(mo, 10);
      const d = parseInt(da, 10);
      const adjHr = adjust12Hour(hr, ampm);
      const h = parseInt(adjHr, 10);
      const min = parseInt(mn, 10);
      const sVal = sc ? parseInt(sc, 10) : 0;

      if (validateComponents(y, m, d, h, min, sVal)) {
        const msStr = msPart ? `.${msPart.slice(0, 3).padEnd(3, "0")}` : ".000";
        const tzStr = formatOffset(tzPart);
        const iso = `${yr}-${mo}-${pad(d)}T${adjHr}:${pad(min)}:${pad(sVal)}${msStr}${tzStr}`;
        const parsed = new Date(iso);
        if (isValidDate(parsed)) return parsed.toISOString();
      }
    }
  }

  // ── Format 7: Fallback direct Date parse ────────────────────────────────────
  const fallback = new Date(s);
  if (isValidDate(fallback)) {
    return fallback.toISOString();
  }

  return null;
}

/**
 * Builds a ParseReport summarizing valid and rejected rows, counting rejections by reason.
 */
export function buildParseReport(
  totalRows: number,
  validRows: number,
  invalidRows: InvalidRow[]
): ParseReport {
  const rejectedByReason: Record<string, number> = {};

  for (const inv of invalidRows) {
    const reasonCategory = inv.reason.startsWith("Unparseable timestamp")
      ? "Unparseable timestamp"
      : inv.reason;
    rejectedByReason[reasonCategory] = (rejectedByReason[reasonCategory] ?? 0) + 1;
  }

  return {
    totalRows,
    validRows,
    rejectedCount: invalidRows.length,
    rejectedByReason,
    invalidRows,
  };
}
