/**
 * Hand-authored fixture with 4 realistic incidents.
 * Used so the UI can be built and demoed before the engine is complete.
 *
 * Owner: Person A (src/engine/, src/data/, tests/)
 */

import type { AnalysisResult, Config } from "@/types";

// ─── Shared config ────────────────────────────────────────────────────────────

const config: Config = {
  thresholds: {
    failedLogonsPerHour: 10,
    distinctHostsPerHour: 5,
    offHoursLogonRisk: 30,
    lateralMovementHopCount: 3,
  },
  trainingPeriod: {
    start: "2024-02-01T00:00:00Z",
    end: "2024-02-29T23:59:59Z",
  },
  timezone: "America/New_York",
  maintenanceWindows: [
    { start: "2024-03-10T02:00:00Z", end: "2024-03-10T04:00:00Z" },
  ],
  approvedAccounts: ["svc-backup", "svc-monitor"],
  vpnCidrs: ["10.100.0.0/16", "172.20.0.0/14"],
  assets: [
    { host: "DC01", role: "domain-controller", privileged: true },
    { host: "DC02", role: "domain-controller", privileged: true },
    { host: "FS01", role: "file-server" },
    { host: "WSADMIN01", role: "admin-workstation", privileged: true },
    { host: "WORKSTATION-042", role: "user-workstation" },
    { host: "WORKSTATION-117", role: "user-workstation" },
    { host: "SQLPROD01", role: "database-server", privileged: true },
  ],
  privilegedAccounts: ["adm-jsmith", "adm-bwilson", "domain-admin", "krbtgt"],
  ipLocations: [
    { cidr: "192.168.1.0/24", location: "HQ LAN" },
    { cidr: "10.100.0.0/16", location: "Corporate VPN" },
    { cidr: "185.220.101.0/24", location: "Tor Exit Node (RU)" },
    { cidr: "103.140.213.0/24", location: "DigitalOcean SGP" },
  ],
};

// ─── Incidents ────────────────────────────────────────────────────────────────

export const sampleResult: AnalysisResult = {
  config,

  ingestReport: {
    totalRows: 4820,
    validRows: 4801,
    invalidRows: [
      { row: "row-3712", reason: "Missing field: username" },
      { row: "row-4501", reason: "Unparseable timestamp: '03/99/2024'" },
      { row: "row-4510", reason: "Unparseable timestamp: '03/99/2024'" },
    ],
    duplicatesRemoved: 16,
    missingFieldCounts: { logonType: 43, sourceIp: 7 },
  },

  // ── Events (excerpt – real fixture would have many more) ──────────────────
  events: [
    // Incident 1 evidence
    {
      id: "evt-001",
      timestamp: "2024-03-15T02:17:44Z",
      username: "adm-jsmith",
      sourceIp: "185.220.101.47",
      host: "DC01",
      eventType: "4625",
      result: "FAILURE",
      logonType: "3",
      rawRow: "2024-03-15T02:17:44Z,adm-jsmith,185.220.101.47,DC01,4625,FAILURE,3",
      flags: ["off-hours", "privileged-account", "tor-exit-node", "domain-controller"],
    },
    {
      id: "evt-002",
      timestamp: "2024-03-15T02:18:01Z",
      username: "adm-jsmith",
      sourceIp: "185.220.101.47",
      host: "DC01",
      eventType: "4624",
      result: "SUCCESS",
      logonType: "3",
      rawRow: "2024-03-15T02:18:01Z,adm-jsmith,185.220.101.47,DC01,4624,SUCCESS,3",
      flags: ["off-hours", "privileged-account", "tor-exit-node", "domain-controller"],
    },
    {
      id: "evt-003",
      timestamp: "2024-03-15T02:18:55Z",
      username: "adm-jsmith",
      sourceIp: "185.220.101.47",
      host: "DC02",
      eventType: "4624",
      result: "SUCCESS",
      logonType: "3",
      rawRow: "2024-03-15T02:18:55Z,adm-jsmith,185.220.101.47,DC02,4624,SUCCESS,3",
      flags: ["off-hours", "privileged-account", "tor-exit-node", "domain-controller", "lateral-movement"],
    },
    {
      id: "evt-004",
      timestamp: "2024-03-15T02:21:10Z",
      username: "adm-jsmith",
      sourceIp: "185.220.101.47",
      host: "SQLPROD01",
      eventType: "4624",
      result: "SUCCESS",
      logonType: "3",
      rawRow: "2024-03-15T02:21:10Z,adm-jsmith,185.220.101.47,SQLPROD01,4624,SUCCESS,3",
      flags: ["off-hours", "privileged-account", "tor-exit-node", "lateral-movement"],
    },
    // Incident 2 evidence
    {
      id: "evt-101",
      timestamp: "2024-03-14T08:55:03Z",
      username: "lmartinez",
      sourceIp: "192.168.1.88",
      host: "DC01",
      eventType: "4625",
      result: "FAILURE",
      logonType: "3",
      rawRow: "2024-03-14T08:55:03Z,lmartinez,192.168.1.88,DC01,4625,FAILURE,3",
      flags: ["credential-spray"],
    },
    {
      id: "evt-102",
      timestamp: "2024-03-14T08:55:11Z",
      username: "lmartinez",
      sourceIp: "192.168.1.88",
      host: "FS01",
      eventType: "4625",
      result: "FAILURE",
      logonType: "3",
      rawRow: "2024-03-14T08:55:11Z,lmartinez,192.168.1.88,FS01,4625,FAILURE,3",
      flags: ["credential-spray"],
    },
    // Incident 3 evidence
    {
      id: "evt-201",
      timestamp: "2024-03-13T19:41:00Z",
      username: "svc-backup",
      sourceIp: "103.140.213.77",
      host: "SQLPROD01",
      eventType: "4624",
      result: "SUCCESS",
      logonType: "3",
      rawRow: "2024-03-13T19:41:00Z,svc-backup,103.140.213.77,SQLPROD01,4624,SUCCESS,3",
      flags: ["external-ip", "service-account", "anomalous-source"],
    },
    // Incident 4 evidence
    {
      id: "evt-301",
      timestamp: "2024-03-12T15:10:00Z",
      username: "kthompson",
      sourceIp: "192.168.1.55",
      host: "WORKSTATION-042",
      eventType: "4624",
      result: "SUCCESS",
      logonType: "2",
      rawRow: "2024-03-12T15:10:00Z,kthompson,192.168.1.55,WORKSTATION-042,4624,SUCCESS,2",
      flags: [],
    },
    {
      id: "evt-302",
      timestamp: "2024-03-12T15:12:00Z",
      username: "kthompson",
      sourceIp: "192.168.1.55",
      host: "WORKSTATION-117",
      eventType: "4624",
      result: "SUCCESS",
      logonType: "3",
      rawRow: "2024-03-12T15:12:00Z,kthompson,192.168.1.55,WORKSTATION-117,4624,SUCCESS,3",
      flags: ["lateral-movement"],
    },
    {
      id: "evt-303",
      timestamp: "2024-03-12T15:15:00Z",
      username: "kthompson",
      sourceIp: "192.168.1.55",
      host: "FS01",
      eventType: "4624",
      result: "SUCCESS",
      logonType: "3",
      rawRow: "2024-03-12T15:15:00Z,kthompson,192.168.1.55,FS01,4624,SUCCESS,3",
      flags: ["lateral-movement"],
    },
  ],

  // ── Alerts ────────────────────────────────────────────────────────────────
  alerts: [
    // Incident 1: critical — privileged account via Tor
    {
      id: "alert-001",
      ruleId: "RULE-TOR-PRIV-LOGON",
      username: "adm-jsmith",
      timeStart: "2024-03-15T02:17:44Z",
      timeEnd: "2024-03-15T02:21:10Z",
      severity: "critical",
      evidenceIds: ["evt-001", "evt-002"],
      explanation:
        "Privileged account adm-jsmith authenticated to a domain controller from a known Tor exit-node IP (185.220.101.47) during off-hours, after one failed attempt.",
      details: { torIp: "185.220.101.47", location: "Tor Exit Node (RU)", failedAttempts: 1 },
    },
    {
      id: "alert-002",
      ruleId: "RULE-LATERAL-MOVEMENT",
      username: "adm-jsmith",
      timeStart: "2024-03-15T02:18:01Z",
      timeEnd: "2024-03-15T02:21:10Z",
      severity: "critical",
      evidenceIds: ["evt-002", "evt-003", "evt-004"],
      explanation:
        "After the initial logon, adm-jsmith accessed 3 additional privileged hosts (DC01 → DC02 → SQLPROD01) within 3 minutes — a pattern consistent with lateral movement.",
      details: { hopCount: 3, hosts: ["DC01", "DC02", "SQLPROD01"], windowSecs: 189 },
    },
    // Incident 2: high — credential spray
    {
      id: "alert-003",
      ruleId: "RULE-CREDENTIAL-SPRAY",
      username: "lmartinez",
      timeStart: "2024-03-14T08:55:03Z",
      timeEnd: "2024-03-14T08:55:18Z",
      severity: "high",
      evidenceIds: ["evt-101", "evt-102"],
      explanation:
        "lmartinez produced 14 failed logon attempts against 6 distinct hosts within 60 seconds, consistent with a credential-spraying pattern.",
      details: { failCount: 14, distinctHosts: 6, windowSecs: 15 },
    },
    // Incident 3: medium — service account from external IP
    {
      id: "alert-004",
      ruleId: "RULE-SVC-ACCOUNT-EXTERNAL-IP",
      username: "svc-backup",
      timeStart: "2024-03-13T19:41:00Z",
      timeEnd: "2024-03-13T19:41:00Z",
      severity: "medium",
      evidenceIds: ["evt-201"],
      explanation:
        "Service account svc-backup logged on to SQLPROD01 from an external IP (103.140.213.77 / DigitalOcean SGP). Service accounts should only authenticate from internal subnets.",
      details: { sourceIp: "103.140.213.77", location: "DigitalOcean SGP", expectedSubnet: "192.168.0.0/16" },
    },
    // Incident 4: low — user lateral movement (business hours)
    {
      id: "alert-005",
      ruleId: "RULE-LATERAL-MOVEMENT",
      username: "kthompson",
      timeStart: "2024-03-12T15:10:00Z",
      timeEnd: "2024-03-12T15:15:00Z",
      severity: "low",
      evidenceIds: ["evt-301", "evt-302", "evt-303"],
      explanation:
        "kthompson accessed 3 hosts (WORKSTATION-042 → WORKSTATION-117 → FS01) within 5 minutes during business hours. Hop count exceeds the configured threshold of 2.",
      details: { hopCount: 3, hosts: ["WORKSTATION-042", "WORKSTATION-117", "FS01"], windowSecs: 300 },
    },
  ],

  // ── Incidents ─────────────────────────────────────────────────────────────
  incidents: [
    // ── INCIDENT 1: CRITICAL – Privileged account via Tor + lateral movement ──
    {
      id: "INC-2024-001",
      username: "adm-jsmith",
      alerts: [], // populated below to avoid circular reference in the literal
      score: 98,
      severity: "critical",
      explanation:
        "Privileged administrator account adm-jsmith shows multiple high-confidence suspicious indications: off-hours authentication from a Tor exit-node to two domain controllers and a production database, preceded by a failed logon. The combination of identity, source, timing, and rapid host traversal is highly anomalous.",
      scoreBreakdown: [
        { label: "Privileged account", points: 20 },
        { label: "Tor exit-node source IP", points: 25 },
        { label: "Off-hours activity", points: 10 },
        { label: "Failed logon precursor", points: 8 },
        { label: "Domain controller targeted", points: 15 },
        { label: "Lateral movement (3 hops, 3 min)", points: 20 },
      ],
      triageSteps: [
        "1. Confirm with adm-jsmith whether they initiated this session (phone/out-of-band).",
        "2. Immediately suspend the account pending investigation if unconfirmed.",
        "3. Collect full memory dump from DC01 and DC02 for forensic analysis.",
        "4. Rotate krbtgt secret (twice) to invalidate any Kerberos tickets that may have been harvested.",
        "5. Review SQLPROD01 query logs for data exfiltration indicators.",
        "6. Block 185.220.101.47 and the full Tor exit-node CIDR at the perimeter firewall.",
        "7. Escalate to IR team and open a formal incident ticket.",
      ],
      disposition: "suspicious",
    },

    // ── INCIDENT 2: HIGH – Credential spray ───────────────────────────────
    {
      id: "INC-2024-002",
      username: "lmartinez",
      alerts: [],
      score: 72,
      severity: "high",
      explanation:
        "User lmartinez generated 14 failed logons across 6 hosts in under 20 seconds during business hours from an internal workstation. The burst pattern and multi-target scope are suspicious indications of credential spraying — possibly a compromised workstation running an automated tool.",
      scoreBreakdown: [
        { label: "Failed logon count (14 in 15 s)", points: 28 },
        { label: "Distinct host targets (6)", points: 22 },
        { label: "Burst rate (sub-second intervals)", points: 15 },
        { label: "Internal source (reduced weight)", points: 7 },
      ],
      triageSteps: [
        "1. Verify lmartinez was physically at their workstation at 08:55 on 2024-03-14.",
        "2. Inspect WORKSTATION-042 for malware, rogue scripts, or unexpected scheduled tasks.",
        "3. Check EDR telemetry for process injection or unsigned binaries launched around 08:54.",
        "4. Reset lmartinez password and session tokens if workstation compromise is confirmed.",
        "5. Review targeted hosts for successful logons from lmartinez after the spray window.",
      ],
      disposition: "suspicious",
    },

    // ── INCIDENT 3: MEDIUM – Service account from external IP ─────────────
    {
      id: "INC-2024-003",
      username: "svc-backup",
      alerts: [],
      score: 55,
      severity: "medium",
      explanation:
        "Service account svc-backup — listed as an approved account — authenticated to SQLPROD01 from a DigitalOcean IP in Singapore. This is anomalous because service accounts should authenticate exclusively from internal hosts. Either the account credentials were exposed, or an automated job is misconfigured to route externally.",
      scoreBreakdown: [
        { label: "Service account from external IP", points: 30 },
        { label: "Target is privileged host (SQLPROD01)", points: 15 },
        { label: "Account is in approvedAccounts list (reduced weight)", points: -10 },
        { label: "Cloud-provider IP (DigitalOcean SGP)", points: 20 },
      ],
      triageSteps: [
        "1. Check if any backup or replication job is configured to originate from 103.140.213.77.",
        "2. Confirm with the database team whether SQLPROD01 should be reachable from external IPs.",
        "3. If no legitimate job is found, rotate the svc-backup credential immediately.",
        "4. Restrict svc-backup to internal IP ranges in Active Directory account properties.",
        "5. Review SQLPROD01 for any data operations performed under this session.",
      ],
      disposition: "suspicious",
    },

    // ── INCIDENT 4: LOW – User lateral movement during business hours ──────
    {
      id: "INC-2024-004",
      username: "kthompson",
      alerts: [],
      score: 28,
      severity: "low",
      explanation:
        "User kthompson logged onto 3 separate internal hosts within 5 minutes during normal business hours. The hop count exceeds the configured threshold (3 > 2). This may be legitimate IT support activity, but it is flagged as a suspicious indication for analyst review.",
      scoreBreakdown: [
        { label: "Lateral movement hop count (3)", points: 18 },
        { label: "All targets are internal (reduced weight)", points: -5 },
        { label: "Business hours (reduced weight)", points: -5 },
        { label: "Non-privileged account", points: 0 },
        { label: "One target is file-server (FS01)", points: 10 },
        { label: "Pattern within threshold window", points: 10 },
      ],
      triageSteps: [
        "1. Ask kthompson whether they visited WORKSTATION-117 and FS01 for a specific task.",
        "2. If IT support role is confirmed, add kthompson to the approvedAccounts list.",
        "3. If unexplained, review FS01 access logs for sensitive file reads/writes.",
      ],
      disposition: "suspicious",
    },
  ],
};

// Back-fill the alerts arrays (avoiding inline self-reference)
sampleResult.incidents[0].alerts = [sampleResult.alerts[0], sampleResult.alerts[1]];
sampleResult.incidents[1].alerts = [sampleResult.alerts[2]];
sampleResult.incidents[2].alerts = [sampleResult.alerts[3]];
sampleResult.incidents[3].alerts = [sampleResult.alerts[4]];
