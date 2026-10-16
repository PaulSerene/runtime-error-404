/**
 * Baseline learning.
 * Owner: Person A (src/engine/, src/data/, tests/)
 *
 * Performance (Step 8):
 * - Single pass over the (already-sorted) event list.
 * - For newHostAccess / newIpOrLocation the "training" window can optionally
 *   be the earliest baselineEarliestPct% of events (by calendar day) rather
 *   than a hard date range, giving better coverage on short datasets.
 *
 * Rules:
 * - ONLY events whose timestamps fall strictly within config.trainingPeriod
 *   OR within the earliest-N%-day slice are used to build baselines.
 * - No network access. No browser APIs.
 */

import type { LogEvent, Config } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserBaseline {
  username: string;
  /**
   * Set of hour-of-day values (0–23, UTC) seen during training.
   * Used to detect off-hours logins.
   */
  knownHours: Set<number>;
  /** Set of source IP strings seen during training. */
  knownSourceIps: Set<string>;
  /** Set of host strings seen during training. */
  knownHosts: Set<string>;
  /** Total event count in the training window. */
  trainingEventCount: number;
  /**
   * true → user had zero events in the training window.
   * Any detection score modifier should treat this conservatively.
   */
  noBaseline: boolean;
}

export type BaselineMap = Map<string, UserBaseline>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayFloor(ts: string): string {
  return ts.slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Computes the cutoff timestamp for the earliest-N% strategy.
 *
 * Given a sorted event list and a percentage (0–100), returns the ISO
 * timestamp of the last event that belongs to a day that falls within
 * the first (pct / 100 * total_days) of the dataset's day range.
 *
 * Returns null when the list is empty or pct ≥ 100.
 */
function earliestPctCutoff(sortedEvents: LogEvent[], pct: number): string | null {
  if (sortedEvents.length === 0 || pct >= 100) return null;

  const firstDay  = dayFloor(sortedEvents[0].timestamp);
  const lastDay   = dayFloor(sortedEvents[sortedEvents.length - 1].timestamp);

  const firstMs = new Date(firstDay).getTime();
  const lastMs  = new Date(lastDay).getTime();

  if (firstMs === lastMs) return null; // single-day dataset — no split possible

  const totalDays = (lastMs - firstMs) / 86_400_000;
  const cutoffMs  = firstMs + (totalDays * pct / 100) * 86_400_000;
  const cutoff    = new Date(cutoffMs).toISOString();

  return cutoff;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Learn per-user baselines from the supplied events in a SINGLE PASS.
 *
 * Two training-window strategies are supported (whichever admits more events):
 *   1. Hard date range:  config.trainingPeriod.start → end
 *   2. Earliest-N% days: first `baselineEarliestPct`% of calendar days
 *      in the dataset (from config.thresholds.baselineEarliestPct, default 20).
 *
 * Events are assumed to be pre-sorted by timestamp (ingest.ts guarantees this).
 *
 * @param events   Full event list (post-ingest, pre-detection). Must be sorted.
 * @param config   Config whose trainingPeriod and thresholds define the window.
 * @returns        Map from username → UserBaseline.
 */
export function learnBaselines(events: LogEvent[], config: Config): BaselineMap {
  const trainStart = new Date(config.trainingPeriod.start).getTime();
  const trainEnd   = new Date(config.trainingPeriod.end).getTime();

  const pct      = config.thresholds["baselineEarliestPct"] ?? 20;
  const pctCutoff = earliestPctCutoff(events, pct);

  const map: BaselineMap = new Map();

  const ensureEntry = (username: string): UserBaseline => {
    if (!map.has(username)) {
      map.set(username, {
        username,
        knownHours:     new Set(),
        knownSourceIps: new Set(),
        knownHosts:     new Set(),
        trainingEventCount: 0,
        noBaseline: true,
      });
    }
    return map.get(username)!;
  };

  // Single pass — events are already sorted, so we can early-exit for the
  // pct strategy once we pass its cutoff.
  for (const evt of events) {
    const entry = ensureEntry(evt.username);

    const ts = new Date(evt.timestamp).getTime();

    const inHardWindow = ts >= trainStart && ts <= trainEnd;
    const inPctWindow  = pctCutoff !== null && evt.timestamp <= pctCutoff;

    if (!inHardWindow && !inPctWindow) continue;

    entry.knownHours.add(new Date(evt.timestamp).getUTCHours());
    if (evt.sourceIp) entry.knownSourceIps.add(evt.sourceIp);
    if (evt.host)     entry.knownHosts.add(evt.host);
    entry.trainingEventCount++;
    entry.noBaseline = false;
  }

  return map;
}

/**
 * Retrieve a user's baseline, or synthesise a "no baseline" sentinel if the
 * user was never seen.
 */
export function getBaseline(map: BaselineMap, username: string): UserBaseline {
  if (map.has(username)) return map.get(username)!;
  return {
    username,
    knownHours: new Set(),
    knownSourceIps: new Set(),
    knownHosts: new Set(),
    trainingEventCount: 0,
    noBaseline: true,
  };
}
