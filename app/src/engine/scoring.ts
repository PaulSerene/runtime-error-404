/**
 * Incident scoring.
 * Owner: Person A — No network access. No browser APIs.
 *
 * Scoring rubric (max 100):
 *   15 pts per distinct deterministic rule fired, capped at 60
 *   +10 pts if statistical anomaly findings are present (non-duplicative)
 *   +15 if user is in config.privilegedAccounts
 *   +15 if any alert's host is marked privileged: true in assets
 *   +10 if ≥ 3 distinct rules fired
 */
import type { Alert, Config, Incident, ScoreBreakdownEntry, Severity } from "@/types";

// ─── Triage step templates keyed by ruleId ─────────────────────────────────

const TRIAGE_STEPS: Record<string, string[]> = {
  "RULE-BRUTE-FORCE": [
    "Check account lockout status and reset if necessary.",
    "Verify whether the source IP belongs to the user's expected location.",
    "Review the targeted host for signs of compromise.",
    "Enable MFA for this account if not already enforced.",
  ],
  "RULE-FAILURE-THEN-SUCCESS": [
    "Confirm the successful logon with the account owner.",
    "Examine processes and commands executed after the successful login.",
    "Check for data exfiltration indicators (large transfers, new outbound connections).",
    "Temporarily suspend the account pending investigation.",
  ],
  "RULE-PASSWORD-SPRAY": [
    "Block the attacking source IP at the firewall.",
    "Audit all targeted accounts for successful follow-on logins.",
    "Force password resets for targeted accounts as a precaution.",
    "Increase authentication logging verbosity on the targeted systems.",
  ],
  "RULE-OFF-HOURS": [
    "Contact the user to verify whether the off-hours login was intentional.",
    "Review what actions were taken during the off-hours session.",
    "Check whether any privileged operations were performed.",
  ],
  "RULE-NEW-SOURCE-IP": [
    "Verify with the user whether they logged in from a new location.",
    "Geolocate the source IP and compare with the user's known locations.",
    "Review all actions performed in the session from the new IP.",
  ],
  "RULE-LATERAL-MOVEMENT": [
    "Map the hosts accessed and determine whether access was authorised.",
    "Look for privilege escalation or credential dumping on the new hosts.",
    "Isolate the account and initiate a credential rotation.",
    "Perform forensic triage on all newly accessed hosts.",
  ],
  "RULE-UNFAMILIAR-HOST": [
    "Verify whether access to this specific host was authorized for the account.",
    "Inspect security logs and process creation events on the newly accessed host.",
    "Check if credentials were recovered or cached on the origin machine.",
  ],
  "RULE-UNKNOWN-ACCOUNT": [
    "Examine source IP for broader scanning or password spraying against non-existent accounts.",
    "Verify if decommissioned or misspelled legacy accounts are being accessed.",
    "Inspect perimeter firewall and VPN gateway access logs for reconnaissance.",
  ],
  "RULE-IMPOSSIBLE-TRAVEL": [
    "Contact the user immediately to verify their physical whereabouts during the login window.",
    "Check if corporate VPN, cloud proxy, or satellite network caused apparent geographic relocation.",
    "Invalidate active session tokens and enforce credentials reset if physical presence is disputed.",
  ],
  "RULE-ATTACK-SEQUENCE": [
    "Investigate multi-stage sequence: failures -> credential compromise -> host lateral movement.",
    "Immediately isolate the user account and revoke active authentication tickets.",
    "Conduct endpoint incident response on all hosts accessed in the sequence.",
  ],
  "ANOMALY-FAILED-LOGINS": [
    "Review authentication error codes for the flagged account (e.g. bad password vs expired).",
    "Check for misconfigured local scripts or background services authenticating with stale credentials.",
  ],
  "ANOMALY-DISTINCT-HOSTS": [
    "Audit list of destination systems accessed against the employee's role and business justification.",
    "Check for automated administrative tool activity (PowerShell, WMI, PsExec).",
  ],
  "ANOMALY-SOURCE-IP-FAILURES": [
    "Investigate source IP address reputation and internal vs external network placement.",
    "Identify whether source IP belongs to shared infrastructure, NAT gateway, or proxy.",
  ],
};

const DEFAULT_TRIAGE = [
  "Review the flagged events with the account owner.",
  "Escalate to the security operations team if activity cannot be explained.",
  "Document findings and preserve logs for audit trail.",
];

// ─── Score → severity mapping ─────────────────────────────────────────────

export function scoreToSeverity(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

// ─── Core scoring function ────────────────────────────────────────────────

export function scoreIncident(
  id: string,
  alerts: Alert[],
  config: Config,
): Incident {
  const username = alerts[0].username;

  // Separate deterministic rules from statistical anomalies
  const ruleAlerts = alerts.filter((a) => a.kind !== "anomaly");
  const anomalyAlerts = alerts.filter((a) => a.kind === "anomaly");

  const distinctRules = new Set(ruleAlerts.map((a) => a.ruleId));
  const distinctAnomalies = new Set(anomalyAlerts.map((a) => a.ruleId));

  const breakdown: ScoreBreakdownEntry[] = [];

  // 15 pts per distinct rule, capped at 60
  const rulePoints = Math.min(distinctRules.size * 15, 60);
  if (rulePoints > 0) {
    breakdown.push({
      label: `${distinctRules.size} distinct rule(s) fired (15 pts each, max 60)`,
      points: rulePoints,
    });
  }

  // Statistical anomaly bonus (up to 15 pts if anomalies fired without inflating score)
  let anomalyPoints = 0;
  if (distinctAnomalies.size > 0) {
    anomalyPoints = Math.min(distinctAnomalies.size * 10, 15);
    breakdown.push({
      label: `${distinctAnomalies.size} statistical anomaly method(s) triggered (+${anomalyPoints} pts)`,
      points: anomalyPoints,
    });
  }

  // +15 if privileged user
  let privilegedUserBonus = 0;
  if (config.privilegedAccounts.includes(username)) {
    privilegedUserBonus = 15;
    breakdown.push({ label: "Privileged account", points: 15 });
  }

  // +15 if any alert's host is privileged
  let privilegedHostBonus = 0;
  const anyPrivilegedHost = config.assets
    .filter((a) => a.privileged)
    .some((asset) =>
      alerts.some((alert) => {
        const details = alert.details;
        if (typeof details?.["host"] === "string" && details["host"] === asset.host) return true;
        const newHosts = details?.["newHosts"] as string[] | undefined;
        if (Array.isArray(newHosts) && newHosts.includes(asset.host)) return true;
        if (alert.explanation.includes(asset.host)) return true;
        return false;
      }),
    );

  if (anyPrivilegedHost) {
    privilegedHostBonus = 15;
    breakdown.push({ label: "Alert involves privileged host", points: 15 });
  }

  // +10 if ≥ 3 distinct rules
  let multiRuleBonus = 0;
  if (distinctRules.size >= 3) {
    multiRuleBonus = 10;
    breakdown.push({ label: "≥ 3 distinct rules fired", points: 10 });
  }

  const rawScore = rulePoints + anomalyPoints + privilegedUserBonus + privilegedHostBonus + multiRuleBonus;
  const score    = Math.min(rawScore, 100);
  const severity = scoreToSeverity(score);

  // Build triage steps from fired rules and anomalies
  const allFindingIds = new Set([...distinctRules, ...distinctAnomalies]);
  const triageSteps: string[] = [];
  const seenSteps = new Set<string>();
  for (const findingId of allFindingIds) {
    const steps = TRIAGE_STEPS[findingId] ?? DEFAULT_TRIAGE;
    for (const step of steps) {
      if (!seenSteps.has(step)) {
        seenSteps.add(step);
        triageSteps.push(step);
      }
    }
  }
  if (triageSteps.length === 0) triageSteps.push(...DEFAULT_TRIAGE);

  // Build explanation — NEVER say "confirmed compromise"
  const ruleList = [...distinctRules].join(", ");
  const anomalyList = [...distinctAnomalies].join(", ");
  let explanation = `Suspicious indications observed for user "${username}": `;
  if (distinctRules.size > 0 && distinctAnomalies.size > 0) {
    explanation += `rules [${ruleList}] and statistical anomalies [${anomalyList}]. Score ${score}/100 (${severity}).`;
  } else if (distinctRules.size > 0) {
    explanation += `rules [${ruleList}] fired. Score ${score}/100 (${severity}).`;
  } else {
    explanation += `statistical anomalies [${anomalyList}] detected. Score ${score}/100 (${severity}).`;
  }

  // Collect affected hosts and IPs
  const affectedIps = new Set<string>();
  const affectedHosts = new Set<string>();

  for (const a of alerts) {
    const det = a.details;
    if (det) {
      if (typeof det["sourceIp"] === "string") affectedIps.add(det["sourceIp"]);
      if (typeof det["currentIp"] === "string") affectedIps.add(det["currentIp"]);
      if (typeof det["previousIp"] === "string") affectedIps.add(det["previousIp"]);
      if (typeof det["host"] === "string") affectedHosts.add(det["host"]);
      if (Array.isArray(det["newHosts"])) {
        det["newHosts"].forEach((h: string) => affectedHosts.add(h));
      }
    }
  }

  const detectionTypes: ("rule" | "anomaly")[] = [];
  if (ruleAlerts.length > 0) detectionTypes.push("rule");
  if (anomalyAlerts.length > 0) detectionTypes.push("anomaly");

  const correlationReason = `Alerts correlated for account "${username}" occurring in temporal proximity across ${alerts.length} finding(s).`;
  const dataLimitations = [
    "Analysis is strictly offline and based exclusively on provided CSV datasets.",
    "Absence of threat-intel lookups means reputation scores reflect local observation only.",
  ];

  return {
    id,
    username,
    alerts,
    score,
    severity,
    explanation,
    scoreBreakdown: breakdown,
    triageSteps,
    disposition: "suspicious",
    affectedIps: [...affectedIps],
    affectedHosts: [...affectedHosts],
    correlationReason,
    dataLimitations,
    detectionTypes,
  };
}

