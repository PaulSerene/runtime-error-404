/**
 * Analysis engine — pure, deterministic TypeScript.
 * No network access. No browser APIs. Runs entirely client-side.
 *
 * Owner: Person A (src/engine/, src/data/, tests/)
 */

import type { AnalysisResult, Config } from "@/types";
import { ingestCsv, parseAssetsCsv, parseIpLocationCsv } from "@/engine/ingest";
import { learnBaselines } from "@/engine/baseline";

/**
 * Analyse a Windows Security-log CSV export.
 *
 * @param csvText      Raw CSV string.
 * @param config       Analysis configuration (thresholds, training period, etc.)
 * @param assetsCsv    Optional CSV with host/role/privileged columns.
 * @param ipLocCsv     Optional CSV mapping CIDRs to friendly location names.
 * @returns            A fully-populated AnalysisResult.
 */
export function analyze(
  csvText: string,
  config: Config,
  assetsCsv?: string,
  ipLocCsv?: string,
): AnalysisResult {
  // ── Parse auxiliary CSVs ──────────────────────────────────────────────────
  const _assets   = assetsCsv ? parseAssetsCsv(assetsCsv) : config.assets ?? [];
  const _ipLocs   = ipLocCsv  ? parseIpLocationCsv(ipLocCsv) : [];

  // ── Ingest ────────────────────────────────────────────────────────────────
  const { events, report } = ingestCsv(csvText, config);

  // ── Baseline learning ─────────────────────────────────────────────────────
  const _baselines = learnBaselines(events, config);

  // TODO (Person A): wire rule engine using events, baselines, assets, ipLocs.
  return {
    events,
    ingestReport: report,
    alerts: [],
    incidents: [],
    config,
  };
}
