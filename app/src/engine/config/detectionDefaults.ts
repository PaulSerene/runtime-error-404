/**
 * Loads detection thresholds from config/detection.json and merges them
 * into a Config's thresholds map.
 *
 * The JSON file is the single source of truth for all numeric defaults.
 * Rules use config.thresholds["key"] ?? fallback — the fallback is now
 * only a last-resort safety net; the real default lives in the JSON.
 *
 * No network access. No browser APIs (JSON import is a build-time operation).
 */

import defaults from "../../../config/detection.json";

export type DetectionDefaults = typeof defaults;

const numericDefaults: Record<string, number> = {};
for (const [k, v] of Object.entries(defaults)) {
  if (typeof v === "number") {
    numericDefaults[k] = v;
  }
}

/**
 * Returns a thresholds record that merges detection.json defaults under
 * whatever the caller already has in config.thresholds.
 *
 * Caller-supplied values always win (opt-in override).
 *
 * @example
 *   const config = mergeDetectionDefaults(userConfig);
 *   // config.thresholds.failureCount is now 5 (from JSON) unless overridden
 */
export function mergeDetectionDefaults(
  thresholds: Record<string, number>,
): Record<string, number> {
  return { ...numericDefaults, ...thresholds };
}

/** Typed accessor with a safety-net fallback (in case key is missing from JSON). */
export function threshold(
  thresholds: Record<string, number>,
  key: keyof DetectionDefaults,
  fallback: number,
): number {
  const val = thresholds[key as string];
  return typeof val === "number" ? val : fallback;
}
