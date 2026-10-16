/**
 * schedule/cron-nl.ts
 *
 * Natural-language interval to 5-field cron expression parser.
 *
 * Supported phrase forms:
 *   - Leading token: "^\d+[smhd]$"  (e.g. "5m", "2h", "1d", "30s")
 *   - "every <N><unit>" compact form  (e.g. "every 20m")
 *   - "every <N> <unit-word>" verbose form  (e.g. "every 5 minutes", "every 2 hours")
 *
 * Unit mapping:
 *   s  = seconds (ceiled to 1-minute minimum)
 *   m  = minutes
 *   h  = hours
 *   d  = days
 *
 * Interval to cron table (step = asterisk-slash-N):
 *   Nm  (N<=59)          ->  every N minutes
 *   Nm  (N>=60, div 60)  ->  every H hours (H = N/60)
 *   Nh  (N<=23)          ->  every N hours
 *   Nd                   ->  every N days
 *
 * Out-of-range / non-divisible values are rounded to the nearest
 * cron-expressible interval; the `rounded` field explains the change.
 *
 * Pure / deterministic -- no Date.now / Math.random.
 */

export interface ParseResult {
  /** 5-field cron expression */
  cron: string;
  /** Human-readable note when the requested interval was rounded */
  rounded?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type Unit = "s" | "m" | "h" | "d";

interface Parsed {
  value: number;
  unit: Unit;
}

/** Normalise verbose unit words to single-char unit codes. */
function normaliseUnit(raw: string): Unit | null {
  const s = raw.toLowerCase().replace(/s$/, ""); // strip trailing 's'
  if (s === "second" || raw === "s") return "s";
  if (s === "minute" || raw === "m") return "m";
  if (s === "hour" || raw === "h") return "h";
  if (s === "day" || raw === "d") return "d";
  return null;
}

/**
 * Try to extract an interval from the input string.
 * Returns null when no recognisable pattern is found.
 */
function extractInterval(input: string): Parsed | null {
  const trimmed = input.trim();

  // Leading compact token: e.g. "5m", "2h", "1d", "30s"
  const leadMatch = /^(\d+)([smhd])(?:\s|$)/.exec(trimmed);
  if (leadMatch) {
    return { value: Number(leadMatch[1]), unit: leadMatch[2] as Unit };
  }

  // "every <N><unit>" -- compact, e.g. "every 20m"
  const compactMatch = /every\s+(\d+)([smhd])(?:\s|$)/i.exec(trimmed);
  if (compactMatch) {
    return { value: Number(compactMatch[1]), unit: compactMatch[2] as Unit };
  }

  // "every <N> <unit-word>" -- e.g. "every 5 minutes", "every 2 hours"
  const wordMatch = /every\s+(\d+)\s+([a-z]+)/i.exec(trimmed);
  if (wordMatch) {
    const unit = normaliseUnit(wordMatch[2] ?? "");
    if (unit) {
      return { value: Number(wordMatch[1]), unit };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Nearest-clean-interval finders
// ---------------------------------------------------------------------------

/** Clean minute values that cron can express with "/N". All divide 60. */
const CLEAN_MINUTES = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60] as const;

/** Find the nearest expressible minute step (divisor of 60). */
function nearestCleanMinutes(n: number): number {
  let best = CLEAN_MINUTES[0] as number;
  let bestDist = Math.abs(n - best);
  for (const m of CLEAN_MINUTES) {
    const dist = Math.abs(n - m);
    if (dist < bestDist) {
      bestDist = dist;
      best = m;
    }
  }
  return best;
}

/** Clean hour steps that cron can express with "/N". All divide 24. */
const CLEAN_HOURS = [1, 2, 3, 4, 6, 8, 12, 24] as const;

function nearestCleanHours(n: number): number {
  let best = CLEAN_HOURS[0] as number;
  let bestDist = Math.abs(n - best);
  for (const h of CLEAN_HOURS) {
    const dist = Math.abs(n - h);
    if (dist < bestDist) {
      bestDist = dist;
      best = h;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a natural-language interval phrase into a 5-field cron expression.
 *
 * @throws {Error} when no interval can be derived from the input.
 */
export function parseIntervalToCron(input: string): ParseResult {
  const parsed = extractInterval(input);

  if (!parsed) {
    throw new Error(
      `Cannot derive an interval from "${input}". ` +
        'Supported forms: "5m", "2h", "every 20m", "every 5 minutes", "every 2 hours", "1d".',
    );
  }

  const { value, unit } = parsed;

  if (value <= 0) {
    throw new Error(`Interval value must be a positive integer, got ${value}.`);
  }

  switch (unit) {
    case "s": {
      // Seconds are ceiled to 1-minute minimum
      const note = `Requested ${value}s -- seconds cannot be expressed in cron; rounded up to every 1 minute (*/1 * * * *).`;
      return { cron: "*/1 * * * *", rounded: note };
    }

    case "m": {
      if (value <= 59) {
        const clean = nearestCleanMinutes(value);
        if (clean === value) {
          return { cron: `*/${value} * * * *` };
        }
        const cronExpr = clean === 60 ? "0 */1 * * *" : `*/${clean} * * * *`;
        const note =
          `Requested every ${value}m -- ${value} is not a divisor of 60; ` +
          `rounded to every ${clean === 60 ? "60m (1h)" : `${clean}m`} (${cronExpr}).`;
        return { cron: cronExpr, rounded: note };
      }
      // N >= 60: convert to hours
      const hours = value / 60;
      if (Number.isInteger(hours) && hours <= 23) {
        return { cron: `0 */${hours} * * *` };
      }
      // Round to nearest clean hour
      const cleanH = nearestCleanHours(Math.round(value / 60));
      const note =
        `Requested every ${value}m -- cannot be expressed cleanly as hours; ` +
        `rounded to every ${cleanH}h (0 */${cleanH} * * *).`;
      return { cron: `0 */${cleanH} * * *`, rounded: note };
    }

    case "h": {
      if (value <= 23) {
        const clean = nearestCleanHours(value);
        if (clean === value) {
          return { cron: `0 */${value} * * *` };
        }
        const note =
          `Requested every ${value}h -- ${value} is not a clean divisor of 24; ` +
          `rounded to every ${clean}h (0 */${clean} * * *).`;
        return { cron: `0 */${clean} * * *`, rounded: note };
      }
      // >= 24h: treat as days
      const days = value / 24;
      if (Number.isInteger(days)) {
        return { cron: `0 0 */${days} * *` };
      }
      const cleanD = Math.round(value / 24);
      const note =
        `Requested every ${value}h -- cannot be expressed cleanly as days; ` +
        `rounded to every ${cleanD}d (0 0 */${cleanD} * *).`;
      return { cron: `0 0 */${cleanD} * *`, rounded: note };
    }

    case "d": {
      return { cron: `0 0 */${value} * *` };
    }
  }
}
