/**
 * Incident scoring.
 * Owner: Person A — No network access. No browser APIs.
 *
 * Scoring rubric (max 100):
 *   15 pts per distinct rule fired, capped at 60
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
  const distinctRules = new Set(alerts.map((a) => a.ruleId));

  const breakdown: ScoreBreakdownEntry[] = [];

  // 15 pts per distinct rule, capped at 60
  const rulePoints = Math.min(distinctRules.size * 15, 60);
  if (rulePoints > 0) {
    breakdown.push({ label: `${distinctRules.size} distinct rule(s) fired (15 pts each, max 60)`, points: rulePoints });
  }

  // +15 if privileged user
  let privilegedUserBonus = 0;
  if (config.privilegedAccounts.includes(username)) {
    privilegedUserBonus = 15;
    breakdown.push({ label: "Privileged account", points: 15 });
  }

  // +15 if any alert's host is privileged
  let privilegedHostBonus = 0;
  const alertHosts = alerts.flatMap((a) => a.evidenceIds.length > 0 ? [a] : []).map((a) => a.details?.["host"] as string | undefined);
  // Also extract hosts from alert details if available, or check hosts mentioned in evidence
  const privilegedHostSet = new Set(config.assets.filter((a) => a.privileged).map((a) => a.host));

  // Check if any alert's details or explanation references a privileged host
  const anyPrivilegedHost = config.assets
    .filter((a) => a.privileged)
    .some((asset) =>
      alerts.some((alert) => {
        // Check details.newHosts, alert explanation, or alert details.sourceIp/host
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

  const rawScore = rulePoints + privilegedUserBonus + privilegedHostBonus + multiRuleBonus;
  const score    = Math.min(rawScore, 100);
  const severity = scoreToSeverity(score);

  // Build triage steps from fired rules
  const triageSteps: string[] = [];
  const seenSteps = new Set<string>();
  for (const ruleId of distinctRules) {
    const steps = TRIAGE_STEPS[ruleId] ?? DEFAULT_TRIAGE;
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
  const explanation = `Suspicious indications observed for user "${username}": rules ${ruleList} fired. Score ${score}/100 (${severity}).`;

  const timeStart = alerts.map((a) => a.timeStart).sort()[0];
  const timeEnd   = alerts.map((a) => a.timeEnd).sort().at(-1)!;

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
  };
}
