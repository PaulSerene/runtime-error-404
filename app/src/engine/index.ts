/**
 * Analysis engine — pure, deterministic TypeScript.
 * No network access. No browser APIs. Runs entirely client-side.
 *
 * Owner: Person A (src/engine/, src/data/, tests/)
 */

import type { AnalysisResult, Config } from "@/types";
import { ingestCsv, parseAssetsCsv, parseIpLocationCsv } from "@/engine/ingest";
import { mergeDetectionDefaults } from "@/engine/config/detectionDefaults";
import { learnBaselines } from "@/engine/baseline";
import { repeatedFailures }  from "@/engine/rules/repeatedFailures";
import { burstThenSuccess }  from "@/engine/rules/burstThenSuccess";
import { passwordSpray }     from "@/engine/rules/passwordSpray";
import { unusualHour }       from "@/engine/rules/unusualHour";
import { newIpOrLocation }   from "@/engine/rules/newIpOrLocation";
import { newHostAccess }     from "@/engine/rules/newHostAccess";
import { unfamiliarHost }    from "@/engine/rules/unfamiliarHost";
import { unknownAccount }    from "@/engine/rules/unknownAccount";
import { impossibleTravel }  from "@/engine/rules/impossibleTravel";
import { attackSequence }    from "@/engine/rules/attackSequence";
import { checkRequiredFields, type RuleSkip } from "@/engine/rules/guards";
import { groupIntoIncidents } from "@/engine/incidents";
import { detectStatisticalAnomalies } from "@/engine/statisticalAnomaly";
import { evaluateCapabilities } from "@/engine/capabilities";

import { RULE_ID as RF_ID }  from "@/engine/rules/repeatedFailures";
import { RULE_ID as BTS_ID } from "@/engine/rules/burstThenSuccess";
import { RULE_ID as PS_ID }  from "@/engine/rules/passwordSpray";
import { RULE_ID as UH_ID }  from "@/engine/rules/unusualHour";
import { RULE_ID as NI_ID }  from "@/engine/rules/newIpOrLocation";
import { RULE_ID as NH_ID }  from "@/engine/rules/newHostAccess";
import { RULE_ID as UH2_ID } from "@/engine/rules/unfamiliarHost";
import { RULE_ID as UA_ID }  from "@/engine/rules/unknownAccount";
import { RULE_ID as IT_ID }  from "@/engine/rules/impossibleTravel";
import { RULE_ID as AS_ID }  from "@/engine/rules/attackSequence";

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
  const ipLoc = config.ipLocations ? [...config.ipLocations] : [];
  if (ipLocCsv) {
    const parsed = parseIpLocationCsv(ipLocCsv);
    ipLoc.push(...parsed.map((p) => ({ cidr: p.cidr, location: p.location })));
  }

  // ── Ingest ────────────────────────────────────────────────────────────────
  // ── Merge detection.json defaults into thresholds (caller wins) ───────────
  const mergedConfig: Config = {
    ...config,
    thresholds: mergeDetectionDefaults(config.thresholds),
  };

  const { events, report, schemaMappings } = ingestCsv(csvText, mergedConfig);

  // ── Baseline learning ─────────────────────────────────────────────────────
  const baselines = learnBaselines(events, mergedConfig);

  // ── Detection rules (with required-field guards) ──────────────────────────
  const ruleArgs = [events, baselines, mergedConfig, ipLoc, assets] as const;
  const skips: RuleSkip[] = [];

  function runRule<T>(
    ruleId: string,
    fn: () => T[],
  ): T[] {
    const skip = checkRequiredFields(ruleId, events);
    if (skip) {
      skips.push(skip);
      return [];
    }
    return fn();
  }

  // ── 9 Deterministic Rule Categories ───────────────────────────────────────
  const ruleAlerts = [
    ...runRule(RF_ID,  () => repeatedFailures(...ruleArgs)),
    ...runRule(BTS_ID, () => burstThenSuccess(...ruleArgs)),
    ...runRule(PS_ID,  () => passwordSpray(...ruleArgs)),
    ...runRule(UH_ID,  () => unusualHour(...ruleArgs)),
    ...runRule(NI_ID,  () => newIpOrLocation(...ruleArgs)),
    ...runRule(NH_ID,  () => newHostAccess(...ruleArgs)),
    ...runRule(UH2_ID, () => unfamiliarHost(...ruleArgs)),
    ...runRule(UA_ID,  () => unknownAccount(...ruleArgs)),
    ...runRule(IT_ID,  () => impossibleTravel(...ruleArgs)),
    ...runRule(AS_ID,  () => attackSequence(...ruleArgs)),
  ];

  // ── Statistical Anomaly Detection (MAD & Distributional Analysis) ─────────
  const anomalyAlerts = detectStatisticalAnomalies(events, mergedConfig);

  // Combine both finding types
  const allAlerts = [...ruleAlerts, ...anomalyAlerts];

  // ── Incident grouping + scoring ───────────────────────────────────────────
  const incidents = groupIntoIncidents(allAlerts, mergedConfig);

  // ── Detection capabilities evaluation ─────────────────────────────────────
  const capabilities = evaluateCapabilities(
    events,
    mergedConfig,
    Boolean(ipLocCsv || (config.ipLocations && config.ipLocations.length > 0)),
    Boolean(assetsCsv || (config.assets && config.assets.length > 0)),
  );

  // ── Surface skips in the ingest report ────────────────────────────────────
  // Skips are recorded as InvalidRow-like entries so the UI's IngestPanel
  // can display them without needing a new top-level field.
  const skippedRuleRows = skips.map((s) => ({
    row: s.ruleId,
    reason: s.reason,
  }));

  return {
    events,
    ingestReport: {
      ...report,
      // Append rule-skip notices after any genuine invalid rows
      invalidRows: [...report.invalidRows, ...skippedRuleRows],
    },
    parseReport: report.parseReport,
    alerts: allAlerts,
    incidents,
    config, // return original config, not the merged one
    capabilities,
    schemaMappings,
  };
}
