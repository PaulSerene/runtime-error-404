/**
 * Baseline learning.
 * Owner: Person A (src/engine/, src/data/, tests/)
 *
 * Rules:
 * - ONLY events whose timestamps fall strictly within config.trainingPeriod
 *   are used to learn baselines. Events outside that window are silently
 *   ignored here (they are used later by the rule engine).
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
   * true  → user had zero events in the training window.
   *         Any detection score modifier should treat this conservatively.
   */
  noBaseline: boolean;
}

export type BaselineMap = Map<string, UserBaseline>;

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Learn per-user baselines from the supplied events.
 *
 * @param events   Full event list (post-ingest, pre-detection).
 * @param config   Config whose `trainingPeriod` defines the learning window.
 * @returns        A Map from username → UserBaseline.
 *                 Every username that appears anywhere in `events` will have
 *                 an entry, even if no training data exists for them.
 */
export function learnBaselines(events: LogEvent[], config: Config): BaselineMap {
  const trainStart = new Date(config.trainingPeriod.start).getTime();
  const trainEnd   = new Date(config.trainingPeriod.end).getTime();

  // Initialise an entry for every user seen in ANY event, not just training ones.
  const map: BaselineMap = new Map();

  const ensureEntry = (username: string): UserBaseline => {
    if (!map.has(username)) {
      map.set(username, {
        username,
        knownHours:    new Set(),
        knownSourceIps: new Set(),
        knownHosts:    new Set(),
        trainingEventCount: 0,
        noBaseline: true,
      });
    }
    return map.get(username)!;
  };

  for (const evt of events) {
    const entry = ensureEntry(evt.username);

    const ts = new Date(evt.timestamp).getTime();
    if (ts < trainStart || ts > trainEnd) continue; // outside training window

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
