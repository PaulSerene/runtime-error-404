/**
 * Statistical Anomaly Detection Engine (Offline & Local).
 * Uses robust, explainable statistics (Median, Median Absolute Deviation - MAD).
 *
 * Distinct from deterministic rule matches:
 * Findings are tagged with kind: "anomaly", include observed vs baseline metrics,
 * and enforce minimum baseline sample sizes.
 */

import type { Alert, LogEvent, Config } from "@/types";
import { alertId, isSuppressed, detectionEvents } from "@/engine/rules/guards";

export interface AnomalyReport {
  alerts: Alert[];
  baselineEvaluated: boolean;
  sampleSize: number;
  reason?: string;
}

/**
 * Calculates the median of a numeric array.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculates Median Absolute Deviation (MAD): median(|x_i - median(x)|).
 */
export function medianAbsoluteDeviation(values: number[], med?: number): number {
  if (values.length === 0) return 0;
  const m = med !== undefined ? med : median(values);
  const deviations = values.map((v) => Math.abs(v - m));
  return median(deviations);
}

/**
 * Detects statistical anomalies by comparing evaluation-period behavior
 * against the historical training baseline.
 */
export function detectStatisticalAnomalies(
  events: LogEvent[],
  config: Config,
): Alert[] {
  const alerts: Alert[] = [];
  const minSampleSize = config.thresholds["anomalyMinSampleSize"] ?? 5;
  const madMultiplier = config.thresholds["anomalyMadMultiplier"] ?? 3.0;

  const trainStart = new Date(config.trainingPeriod.start).getTime();
  const trainEnd = new Date(config.trainingPeriod.end).getTime();

  // Baseline events strictly within training period
  const baselineEvents = events.filter((e) => {
    const ts = new Date(e.timestamp).getTime();
    return ts >= trainStart && ts <= trainEnd && !isSuppressed(e, config);
  });

  // Evaluation events after training period
  const evalEvents = detectionEvents(events, config).filter((e) => !isSuppressed(e, config));

  if (evalEvents.length === 0) return [];

  // ── 1. Anomaly: User Failure Volume Spike (MAD on failed logins) ─────────────
  // Measure failure count per user in baseline
  const baselineUserFails = new Map<string, number>();
  const baselineUserTotal = new Map<string, number>();

  for (const e of baselineEvents) {
    if (!e.username) continue;
    baselineUserTotal.set(e.username, (baselineUserTotal.get(e.username) ?? 0) + 1);
    if (e.result === "FAILURE") {
      baselineUserFails.set(e.username, (baselineUserFails.get(e.username) ?? 0) + 1);
    }
  }

  // Measure failure count per user in evaluation period
  const evalUserFails = new Map<string, LogEvent[]>();
  for (const e of evalEvents) {
    if (!e.username || e.result !== "FAILURE") continue;
    if (!evalUserFails.has(e.username)) evalUserFails.set(e.username, []);
    evalUserFails.get(e.username)!.push(e);
  }

  // Compute baseline population failure distribution across all baseline users
  const baselineFailCounts = [...baselineUserFails.values()];
  if (baselineFailCounts.length >= minSampleSize) {
    const medFail = median(baselineFailCounts);
    const madFail = medianAbsoluteDeviation(baselineFailCounts, medFail);
    // Effective scale: 1.4826 * MAD approximates standard deviation for normal distribution
    const threshold = Math.max(medFail + madMultiplier * Math.max(madFail, 1), 4);

    for (const [username, failEvts] of evalUserFails) {
      const observed = failEvts.length;
      if (observed >= threshold) {
        const timeStart = failEvts[0].timestamp;
        const timeEnd = failEvts[failEvts.length - 1].timestamp;

        alerts.push({
          id: alertId("ANOMALY-FAILED-LOGINS", username, timeStart),
          ruleId: "ANOMALY-FAILED-LOGINS",
          username,
          timeStart,
          timeEnd,
          severity: observed >= threshold * 2 ? "high" : "medium",
          kind: "anomaly",
          evidenceIds: failEvts.map((e) => e.id),
          explanation: `Statistical anomaly: user "${username}" accumulated ${observed} authentication failures in the evaluation period, exceeding the historical baseline threshold (${observed} observed vs median ${medFail.toFixed(1)}, threshold ${threshold.toFixed(1)} via MAD).`,
          details: {
            observedFailures: observed,
            baselineMedian: medFail,
            baselineMad: madFail,
            threshold,
            method: "Median Absolute Deviation (MAD)",
          },
          anomalyDetails: {
            metric: "Authentication Failures",
            observed,
            baseline: medFail,
            threshold,
            method: "Median Absolute Deviation (MAD)",
            unit: "failures",
          },
        });
      }
    }
  }

  // ── 2. Anomaly: Distinct Host Access Volume (MAD on distinct hosts per user) ─
  const baselineUserHosts = new Map<string, Set<string>>();
  for (const e of baselineEvents) {
    if (!e.username || !e.host) continue;
    if (!baselineUserHosts.has(e.username)) baselineUserHosts.set(e.username, new Set());
    baselineUserHosts.get(e.username)!.add(e.host);
  }

  const evalUserHosts = new Map<string, { hosts: Set<string>; events: LogEvent[] }>();
  for (const e of evalEvents) {
    if (!e.username || !e.host) continue;
    if (!evalUserHosts.has(e.username)) {
      evalUserHosts.set(e.username, { hosts: new Set(), events: [] });
    }
    const entry = evalUserHosts.get(e.username)!;
    entry.hosts.add(e.host);
    entry.events.push(e);
  }

  const baselineHostCounts = [...baselineUserHosts.values()].map((h) => h.size);
  if (baselineHostCounts.length >= minSampleSize) {
    const medHosts = median(baselineHostCounts);
    const madHosts = medianAbsoluteDeviation(baselineHostCounts, medHosts);
    const hostThreshold = Math.max(medHosts + madMultiplier * Math.max(madHosts, 1), 3);

    for (const [username, { hosts, events: hostEvts }] of evalUserHosts) {
      const observedHosts = hosts.size;
      if (observedHosts >= hostThreshold) {
        const timeStart = hostEvts[0].timestamp;
        const timeEnd = hostEvts[hostEvts.length - 1].timestamp;

        alerts.push({
          id: alertId("ANOMALY-DISTINCT-HOSTS", username, timeStart),
          ruleId: "ANOMALY-DISTINCT-HOSTS",
          username,
          timeStart,
          timeEnd,
          severity: observedHosts >= hostThreshold * 2 ? "high" : "medium",
          kind: "anomaly",
          evidenceIds: hostEvts.map((e) => e.id),
          explanation: `Statistical anomaly: user "${username}" accessed ${observedHosts} distinct hosts in the evaluation period, exceeding historical baseline distribution (${observedHosts} observed vs median ${medHosts.toFixed(1)}, threshold ${hostThreshold.toFixed(1)} via MAD).`,
          details: {
            observedHosts,
            baselineMedian: medHosts,
            baselineMad: madHosts,
            threshold: hostThreshold,
            accessedHosts: [...hosts],
            method: "Median Absolute Deviation (MAD)",
          },
          anomalyDetails: {
            metric: "Distinct Hosts Accessed",
            observed: observedHosts,
            baseline: medHosts,
            threshold: hostThreshold,
            method: "Median Absolute Deviation (MAD)",
            unit: "hosts",
          },
        });
      }
    }
  }

  // ── 3. Anomaly: Source IP Failure Rate Spike ────────────────────────────────
  const baselineIpFails = new Map<string, number>();
  for (const e of baselineEvents) {
    if (!e.sourceIp || e.result !== "FAILURE") continue;
    baselineIpFails.set(e.sourceIp, (baselineIpFails.get(e.sourceIp) ?? 0) + 1);
  }

  const evalIpFails = new Map<string, LogEvent[]>();
  for (const e of evalEvents) {
    if (!e.sourceIp || e.result !== "FAILURE") continue;
    if (!evalIpFails.has(e.sourceIp)) evalIpFails.set(e.sourceIp, []);
    evalIpFails.get(e.sourceIp)!.push(e);
  }

  const ipFailCounts = [...baselineIpFails.values()];
  if (ipFailCounts.length >= minSampleSize) {
    const medIpFail = median(ipFailCounts);
    const madIpFail = medianAbsoluteDeviation(ipFailCounts, medIpFail);
    const ipThreshold = Math.max(medIpFail + madMultiplier * Math.max(madIpFail, 1), 5);

    for (const [ip, failEvts] of evalIpFails) {
      if (failEvts.length >= ipThreshold) {
        const timeStart = failEvts[0].timestamp;
        const timeEnd = failEvts[failEvts.length - 1].timestamp;
        const firstUser = failEvts[0].username || "unknown";

        alerts.push({
          id: alertId("ANOMALY-SOURCE-IP-FAILURES", ip, timeStart),
          ruleId: "ANOMALY-SOURCE-IP-FAILURES",
          username: firstUser,
          timeStart,
          timeEnd,
          severity: "medium",
          kind: "anomaly",
          evidenceIds: failEvts.map((e) => e.id),
          explanation: `Statistical anomaly: source IP ${ip} produced ${failEvts.length} authentication failures, significantly exceeding historical IP baseline (${failEvts.length} observed vs median ${medIpFail.toFixed(1)}, threshold ${ipThreshold.toFixed(1)} via MAD).`,
          details: {
            sourceIp: ip,
            observedFailures: failEvts.length,
            baselineMedian: medIpFail,
            baselineMad: madIpFail,
            threshold: ipThreshold,
            method: "Median Absolute Deviation (MAD)",
          },
          anomalyDetails: {
            metric: "Source IP Failures",
            observed: failEvts.length,
            baseline: medIpFail,
            threshold: ipThreshold,
            method: "Median Absolute Deviation (MAD)",
            unit: "failures",
          },
        });
      }
    }
  }

  return alerts;
}
