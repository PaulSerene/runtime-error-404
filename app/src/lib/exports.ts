/**
 * Client-side export helpers.
 * All functions create a temporary <a> and trigger a browser download.
 */
import type { AnalysisResult } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Escapes CSV values and neutralizes potential spreadsheet formula injection.
 * If a value begins with '=', '+', '-', '@', tab, or CR, it is prepended with a single quote.
 */
export function escCsv(v: unknown): string {
  let s = String(v ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── CSV export ──────────────────────────────────────────────────────────────

/**
 * Generates one CSV row per alert across all incidents.
 * Columns: incidentId, username, score, severity, findingType, ruleId,
 *          timeStart, timeEnd, explanation, evidenceCount, affectedHosts, affectedIps
 */
export function exportCsv(result: AnalysisResult) {
  const header = [
    "incidentId",
    "username",
    "score",
    "severity",
    "findingType",
    "ruleId",
    "timeStart",
    "timeEnd",
    "explanation",
    "evidenceCount",
    "affectedHosts",
    "affectedIps",
  ].join(",");

  const rows = result.incidents.flatMap((inc) =>
    inc.alerts.map((alert) =>
      [
        inc.id,
        inc.username,
        inc.score,
        inc.severity,
        alert.kind === "anomaly" ? "Statistical Anomaly" : "Rule Match",
        alert.ruleId,
        alert.timeStart,
        alert.timeEnd,
        alert.explanation,
        alert.evidenceIds.length,
        (inc.affectedHosts ?? []).join("; "),
        (inc.affectedIps ?? []).join("; "),
      ]
        .map(escCsv)
        .join(","),
    ),
  );

  const csv = [header, ...rows].join("\r\n");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `incidents_${ts}.csv`);
}

// ─── JSON export ─────────────────────────────────────────────────────────────

export function exportJson(result: AnalysisResult) {
  const data = {
    exportedAt: new Date().toISOString(),
    summary: {
      totalEvents: result.events.length,
      incidentCount: result.incidents.length,
      alertCount: result.alerts.length,
      ruleMatches: result.alerts.filter((a) => a.kind !== "anomaly").length,
      statisticalAnomalies: result.alerts.filter((a) => a.kind === "anomaly").length,
      invalidRows: result.ingestReport.invalidRows.length,
      duplicatesRemoved: result.ingestReport.duplicatesRemoved,
    },
    capabilities: result.capabilities ?? [],
    incidents: result.incidents,
    dataLimitations: [
      "Analysis conducted entirely offline without live external threat-intelligence lookups.",
      "Findings represent suspicious indications for human analyst investigation, not confirmed compromise.",
    ],
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  downloadBlob(new Blob([jsonStr], { type: "application/json;charset=utf-8;" }), `soc_investigation_${ts}.json`);
}

// ─── HTML report ─────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

export function exportHtmlReport(result: AnalysisResult) {
  const { incidents, events, ingestReport, config, capabilities } = result;
  const ts = new Date().toISOString();
  const tsDisplay = new Date().toLocaleString();

  const severityCount = (s: string) => incidents.filter((i) => i.severity === s).length;
  const ruleCount = result.alerts.filter((a) => a.kind !== "anomaly").length;
  const anomalyCount = result.alerts.filter((a) => a.kind === "anomaly").length;

  const summaryRows = [
    ["Total events", events.length.toLocaleString()],
    ["Incidents", incidents.length],
    ["Rule Matches", ruleCount],
    ["Statistical Anomalies", anomalyCount],
    ["Critical", severityCount("critical")],
    ["High", severityCount("high")],
    ["Medium", severityCount("medium")],
    ["Low", severityCount("low")],
    ["Invalid rows", ingestReport.invalidRows.length],
    ["Duplicates removed", ingestReport.duplicatesRemoved],
  ];

  const summaryTable = `
  <table>
    <thead><tr><th>Metric</th><th>Value</th></tr></thead>
    <tbody>
      ${summaryRows.map(([k, v]) => `<tr><td>${escHtml(String(k))}</td><td><strong>${escHtml(String(v))}</strong></td></tr>`).join("")}
    </tbody>
  </table>`;

  const capabilityRows = (capabilities ?? [])
    .map((cap) => {
      const statusColor = cap.status === "enabled" ? "#22c55e" : cap.status === "reduced_confidence" ? "#eab308" : "#94a3b8";
      return `<tr>
        <td><strong>${escHtml(cap.name)}</strong> <code>(${escHtml(cap.id)})</code></td>
        <td><span class="badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40">${cap.status.toUpperCase()}</span></td>
        <td style="font-size:0.8rem;color:#cbd5e1">${escHtml(cap.reason)}</td>
      </tr>`;
    })
    .join("");

  const capabilitiesTable = capabilities && capabilities.length > 0 ? `
  <h2>Detection Capabilities & Coverage</h2>
  <table>
    <thead><tr><th>Detection</th><th>Status</th><th>Capability Rationale</th></tr></thead>
    <tbody>${capabilityRows}</tbody>
  </table>` : "";

  const incidentSections = incidents
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((inc) => {
      const color = SEVERITY_COLOR[inc.severity] ?? "#94a3b8";
      const breakdownRows = inc.scoreBreakdown
        .map(
          (e) =>
            `<tr><td>${escHtml(e.label)}</td><td style="text-align:right;font-weight:bold;color:${e.points < 0 ? "#22c55e" : "#f87171"}">${e.points > 0 ? "+" : ""}${e.points}</td></tr>`,
        )
        .join("");

      const alertItems = inc.alerts
        .map(
          (a) => {
            const isAnomaly = a.kind === "anomaly";
            const kindBadge = isAnomaly
              ? `<span class="badge" style="background:#06b6d420;color:#06b6d4;border:1px solid #06b6d440">STATISTICAL ANOMALY</span>`
              : `<span class="badge" style="background:#f9731620;color:#f97316;border:1px solid #f9731640">RULE MATCH</span>`;
            return `
        <div class="alert-card">
          <div class="alert-header">
            <span class="badge" style="background:${SEVERITY_COLOR[a.severity] ?? "#94a3b8"}20;color:${SEVERITY_COLOR[a.severity] ?? "#94a3b8"};border:1px solid ${SEVERITY_COLOR[a.severity] ?? "#94a3b8"}40">${a.severity.toUpperCase()}</span>
            ${kindBadge}
            <code>${escHtml(a.ruleId)}</code>
            <span class="muted">${escHtml(a.id)}</span>
          </div>
          <p>${escHtml(a.explanation)}</p>
          <p class="muted">${escHtml(a.timeStart)} → ${escHtml(a.timeEnd)} · ${a.evidenceIds.length} evidence row(s)</p>
        </div>`;
          },
        )
        .join("");

      const triageList = inc.triageSteps
        .map((step) => `<li>${escHtml(step.replace(/^\d+\.\s*/, ""))}</li>`)
        .join("");

      const hostList = inc.affectedHosts && inc.affectedHosts.length > 0
        ? `<p class="muted"><strong>Affected Hosts:</strong> ${inc.affectedHosts.map(escHtml).join(", ")}</p>`
        : "";
      const ipList = inc.affectedIps && inc.affectedIps.length > 0
        ? `<p class="muted"><strong>Source IPs:</strong> ${inc.affectedIps.map(escHtml).join(", ")}</p>`
        : "";

      return `
    <section class="incident">
      <div class="incident-header" style="border-left:4px solid ${color}">
        <div>
          <span class="incident-id">${escHtml(inc.id)}</span>
          <span class="badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${inc.severity.toUpperCase()}</span>
        </div>
        <div class="score-box" style="color:${color}">
          <span class="score-num">${inc.score}</span>
          <span class="score-label">Risk Score</span>
        </div>
      </div>
      <p class="user-label">👤 Account: <strong>${escHtml(inc.username)}</strong></p>
      ${hostList}
      ${ipList}

      <div class="disclaimer">
        ⚠️ <strong>Important:</strong> These are <em>suspicious indications</em>, not confirmed compromise.
        An analyst must review, validate, and determine the appropriate response before taking any action.
      </div>

      <h4>Explanation</h4>
      <p>${escHtml(inc.explanation)}</p>
      ${inc.correlationReason ? `<p style="font-size:0.85rem;color:#94a3b8"><em>${escHtml(inc.correlationReason)}</em></p>` : ""}

      <h4>Score Breakdown</h4>
      <table>
        <thead><tr><th>Factor</th><th>Points</th></tr></thead>
        <tbody>${breakdownRows}</tbody>
      </table>

      <h4>Constituent Findings (${inc.alerts.length})</h4>
      ${alertItems}

      <h4>Recommended Human Investigation & Response Steps</h4>
      <ol>${triageList}</ol>
    </section>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SOC Investigation Report — ${escHtml(tsDisplay)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.6;padding:2rem}
    a{color:#60a5fa}
    h1{font-size:1.75rem;font-weight:800;color:#fff;margin-bottom:.25rem}
    h2{font-size:1.1rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin:2rem 0 1rem;border-bottom:1px solid #1e293b;padding-bottom:.5rem}
    h3{font-size:1rem;font-weight:700;color:#e2e8f0;margin:1.5rem 0 .75rem}
    h4{font-size:.8rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin:1.25rem 0 .5rem}
    p{margin-bottom:.75rem;font-size:.9rem}
    code{font-family:'Courier New',monospace;font-size:.8em;background:#1e293b;padding:.1em .4em;border-radius:.25rem;color:#93c5fd}
    table{width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:1rem}
    th{background:#1e293b;color:#94a3b8;text-align:left;padding:.5rem .75rem;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}
    td{padding:.5rem .75rem;border-bottom:1px solid #1e293b;color:#cbd5e1}
    tr:nth-child(even) td{background:#0f172a/50}
    .header{margin-bottom:2rem}
    .subtitle{color:#64748b;font-size:.875rem;margin-top:.25rem}
    .config-strip{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0;background:#1e293b;padding:.75rem;border-radius:.5rem}
    .config-pill{background:#334155;padding:.2rem .6rem;border-radius:.25rem;font-size:.75rem;font-family:monospace;color:#cbd5e1}
    .badge{display:inline-flex;align-items:center;padding:.2rem .6rem;border-radius:9999px;font-size:.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
    .incident{background:#1e293b;border-radius:.75rem;padding:1.5rem;margin-bottom:1.5rem}
    .incident-header{display:flex;align-items:flex-start;justify-content:space-between;padding-left:.75rem;margin-bottom:.75rem}
    .incident-id{font-family:monospace;font-size:.8rem;color:#64748b;margin-right:.5rem}
    .score-box{display:flex;flex-direction:column;align-items:flex-end}
    .score-num{font-size:2rem;font-weight:900;line-height:1}
    .score-label{font-size:.65rem;color:#64748b;text-transform:uppercase;letter-spacing:.1em}
    .user-label{font-size:.9rem;font-weight:600;color:#e2e8f0;margin-bottom:.5rem}
    .disclaimer{background:#451a03;border:1px solid #92400e;border-radius:.5rem;padding:.75rem 1rem;margin:.75rem 0 1rem;font-size:.8rem;color:#fcd34d;line-height:1.5}
    .alert-card{background:#0f172a;border:1px solid #334155;border-radius:.5rem;padding:1rem;margin-bottom:.75rem}
    .alert-header{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap}
    .muted{color:#64748b;font-size:.8rem}
    ol{padding-left:1.5rem}
    ol li{margin-bottom:.5rem;font-size:.875rem;color:#cbd5e1}
    footer{margin-top:3rem;padding-top:1rem;border-top:1px solid #1e293b;color:#475569;font-size:.75rem;text-align:center}
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡️ SOC Investigation Report</h1>
    <p class="subtitle">Generated: ${escHtml(tsDisplay)} · Timezone: ${escHtml(config.timezone)} · Execution: Offline Client-Side</p>
    <div class="config-strip">
      <span class="config-pill">Baseline Calibration: ${escHtml(config.trainingPeriod.start.slice(0, 10))} → ${escHtml(config.trainingPeriod.end.slice(0, 10))}</span>
      ${config.approvedAccounts.map((a) => `<span class="config-pill" style="color:#4ade80">✓ ${escHtml(a)}</span>`).join("")}
      ${config.vpnCidrs.map((c) => `<span class="config-pill" style="color:#60a5fa">VPN: ${escHtml(c)}</span>`).join("")}
    </div>
  </div>

  <h2>Summary</h2>
  ${summaryTable}

  ${capabilitiesTable}

  <h2>Correlated Incidents (${incidents.length} total, sorted by risk score)</h2>
  ${incidents.length === 0 ? '<p style="color:#4ade80">✅ No suspicious activity detected in evaluated dataset.</p>' : incidentSections}

  <footer>
    Adaptive Offline SOC Analysis Platform · Fully Local Execution · All findings represent <strong>suspicious indications only</strong>
    and require human analyst validation before any containment or remediation action is taken.
    Generated at ${escHtml(ts)}.
  </footer>
</body>
</html>`;

  const fileTs = ts.replace(/[:.]/g, "-").slice(0, 19);
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8;" }), `report_${fileTs}.html`);
}

