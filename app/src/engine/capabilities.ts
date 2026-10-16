/**
 * Detection Capability Matrix Engine.
 * Evaluates available fields, auxiliary datasets, and baseline sample size
 * to determine which detections can run, which are disabled, and which operate
 * with reduced confidence.
 */
import type { DetectionCapability, LogEvent, Config } from "@/types";
import { RULE_REQUIRED_FIELDS } from "@/engine/rules/guards";

export function evaluateCapabilities(
  events: LogEvent[],
  config: Config,
  hasIpLocCsv: boolean,
  hasAssetsCsv: boolean,
): DetectionCapability[] {
  // Check field presence across dataset
  const hasField = (field: keyof LogEvent): boolean => {
    return events.some((e) => {
      const v = e[field];
      return v !== null && v !== undefined && String(v).trim() !== "";
    });
  };

  const hasTimestamp = hasField("timestamp");
  const hasUsername = hasField("username");
  const hasSourceIp = hasField("sourceIp");
  const hasHost = hasField("host");
  const hasResult = hasField("result");
  const hasSubStatus = hasField("subStatus");
  const hasGeo = hasField("geoCity") || hasField("geoCountry") || (config.ipLocations && config.ipLocations.length > 0) || hasIpLocCsv;

  // Check baseline sample size
  const trainStart = new Date(config.trainingPeriod.start).getTime();
  const trainEnd = new Date(config.trainingPeriod.end).getTime();
  const baselineCount = events.filter((e) => {
    const t = new Date(e.timestamp).getTime();
    return t >= trainStart && t <= trainEnd;
  }).length;
  const hasBaseline = baselineCount >= 5;

  const capabilities: DetectionCapability[] = [
    {
      id: "RULE-BRUTE-FORCE",
      name: "Repeated Failures / Brute-Force",
      category: "rule",
      requiredFields: [...RULE_REQUIRED_FIELDS["RULE-BRUTE-FORCE"]],
      missingFields: [],
      status: "enabled",
      reason: "All required fields (username, result) present.",
    },
    {
      id: "RULE-PASSWORD-SPRAY",
      name: "Password Spraying Detection",
      category: "rule",
      requiredFields: [...RULE_REQUIRED_FIELDS["RULE-PASSWORD-SPRAY"]],
      missingFields: [],
      status: "enabled",
      reason: "All required fields (sourceIp, username, result) present.",
    },
    {
      id: "RULE-FAILURE-THEN-SUCCESS",
      name: "Failure Burst Followed by Success",
      category: "rule",
      requiredFields: [...RULE_REQUIRED_FIELDS["RULE-FAILURE-THEN-SUCCESS"]],
      missingFields: [],
      status: "enabled",
      reason: "All required fields (username, sourceIp, result) present.",
    },
    {
      id: "RULE-UNFAMILIAR-HOST",
      name: "Unfamiliar Host Access",
      category: "rule",
      requiredFields: [...RULE_REQUIRED_FIELDS["RULE-UNFAMILIAR-HOST"]],
      missingFields: [],
      status: "enabled",
      reason: "All required fields (username, host, result) and baseline events present.",
    },
    {
      id: "RULE-OFF-HOURS",
      name: "Unusual Login Times / Off-Hours",
      category: "rule",
      requiredFields: [...RULE_REQUIRED_FIELDS["RULE-OFF-HOURS"]],
      missingFields: [],
      status: "enabled",
      reason: "All required fields (username, result) and timestamps present.",
    },
    {
      id: "RULE-LATERAL-MOVEMENT",
      name: "Lateral Movement Indicators",
      category: "rule",
      requiredFields: [...RULE_REQUIRED_FIELDS["RULE-LATERAL-MOVEMENT"]],
      missingFields: [],
      status: "enabled",
      reason: "All required fields (username, host) present.",
    },
    {
      id: "RULE-UNKNOWN-ACCOUNT",
      name: "Unknown or Invalid Usernames",
      category: "rule",
      requiredFields: [...RULE_REQUIRED_FIELDS["RULE-UNKNOWN-ACCOUNT"]],
      missingFields: [],
      status: "enabled",
      reason: "Authentication result or failure code fields present.",
    },
    {
      id: "RULE-NEW-SOURCE-IP",
      name: "New Source IP / Location Novelty",
      category: "rule",
      requiredFields: [...RULE_REQUIRED_FIELDS["RULE-NEW-SOURCE-IP"]],
      missingFields: [],
      status: "enabled",
      reason: "All required fields (username, sourceIp, result) present.",
    },
    {
      id: "RULE-IMPOSSIBLE-TRAVEL",
      name: "Unusual Location / Impossible Travel",
      category: "rule",
      requiredFields: ["username", "sourceIp", "location"],
      missingFields: [],
      status: "enabled",
      reason: "Location mappings (IP-location table or geographic columns) available.",
    },
    {
      id: "RULE-ATTACK-SEQUENCE",
      name: "Suspicious Multi-Stage Event Sequences",
      category: "rule",
      requiredFields: [...RULE_REQUIRED_FIELDS["RULE-ATTACK-SEQUENCE"]],
      missingFields: [],
      status: "enabled",
      reason: "All required sequence fields (username, result, host) present.",
    },
    {
      id: "ANOMALY-STATISTICAL",
      name: "Statistical Anomaly Detection (MAD)",
      category: "anomaly",
      requiredFields: ["baselineEvents", "result"],
      missingFields: [],
      status: "enabled",
      reason: `Historical baseline contains ${baselineCount} events (minimum: 5).`,
    },
  ];

  // Validate each capability against dataset reality
  for (const cap of capabilities) {
    const missing: string[] = [];

    if (!hasTimestamp) missing.push("timestamp");
    if (cap.requiredFields.includes("username") && !hasUsername) missing.push("username");
    if (cap.requiredFields.includes("sourceIp") && !hasSourceIp) missing.push("sourceIp");
    if (cap.requiredFields.includes("host") && !hasHost) missing.push("host");
    if (cap.requiredFields.includes("result") && !hasResult) missing.push("result");

    if (cap.id === "RULE-IMPOSSIBLE-TRAVEL") {
      if (!hasGeo) {
        missing.push("location / CIDR mapping");
        cap.status = "disabled";
        cap.missingFields = missing;
        cap.reason = "Disabled: No IP-to-location mapping table or geographic columns provided.";
        continue;
      }
    }

    if (cap.id === "ANOMALY-STATISTICAL") {
      if (!hasBaseline) {
        cap.status = "reduced_confidence";
        cap.missingFields = ["sufficient baseline events"];
        cap.reason = `Reduced confidence: baseline sample size is sparse (${baselineCount} events; recommended ≥ 5).`;
        continue;
      }
    }

    if (cap.id === "RULE-UNFAMILIAR-HOST") {
      if (!hasBaseline) {
        cap.status = "reduced_confidence";
        cap.reason = `Reduced confidence: baseline sample size (${baselineCount}) may not cover all routine hosts.`;
      }
    }

    if (missing.length > 0) {
      cap.status = "disabled";
      cap.missingFields = missing;
      cap.reason = `Disabled: missing required dataset fields: ${missing.join(", ")}.`;
    }
  }

  return capabilities;
}
