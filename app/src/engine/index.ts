/**
 * Analysis engine — pure, deterministic TypeScript.
 * No network access. No browser APIs. Runs entirely client-side.
 *
 * Owner: Person A (src/engine/, src/data/, tests/)
 */

import type { AnalysisResult, Config } from "@/types";
import { ingestCsv, parseAssetsCsv, parseIpLocationCsv } from "@/engine/ingest";
import { learnBaselines } from "@/engine/baseline";
import { repeatedFailures }  from "@/engine/rules/repeatedFailures";
import { burstThenSuccess }  from "@/engine/rules/burstThenSuccess";
import { passwordSpray }     from "@/engine/rules/passwordSpray";
import { unusualHour }       from "@/engine/rules/unusualHour";
import { newIpOrLocation }   from "@/engine/rules/newIpOrLocation";
import { newHostAccess }     from "@/engine/rules/newHostAccess";
import { groupIntoIncidents } from "@/engine/incidents";

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
  const assets = assetsCsv
    ? parseAssetsCsv(assetsCsv)
    : config.assets ?? [];

  // ipLoc: merge CSV-parsed entries on top of config.ipLocations
  const ipLoc = config.ipLocations ?? [];
  if (ipLocCsv) {
    const parsed = parseIpLocationCsv(ipLocCsv);
    // Convert back to plain IpLocationEntry shape expected by rules
    ipLoc.push(...parsed.map((p) => ({ cidr: p.cidr, location: p.location })));
  }

  // ── Ingest ────────────────────────────────────────────────────────────────
  const { events, report } = ingestCsv(csvText, config);

  // ── Baseline learning ─────────────────────────────────────────────────────
  const baselines = learnBaselines(events, config);

  // ── Detection rules ───────────────────────────────────────────────────────
  const ruleArgs = [events, baselines, config, ipLoc, assets] as const;

  const allAlerts = [
    ...repeatedFailures(...ruleArgs),
    ...burstThenSuccess(...ruleArgs),
    ...passwordSpray(...ruleArgs),
    ...unusualHour(...ruleArgs),
    ...newIpOrLocation(...ruleArgs),
    ...newHostAccess(...ruleArgs),
  ];

  // ── Incident grouping + scoring ───────────────────────────────────────────
  const incidents = groupIntoIncidents(allAlerts, config);

  return {
    events,
    ingestReport: report,
    alerts: allAlerts,
    incidents,
    config,
  };
}
