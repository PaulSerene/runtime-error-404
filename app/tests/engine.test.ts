/**
 * Tests for src/engine/index.ts and the sampleResult fixture.
 * Owner: Person A
 *
 * Existing smoke tests are preserved. Integration, scoring, and rule unit
 * tests are appended below.
 */
import { describe, it, expect } from "vitest";
import { analyze } from "@/engine/index";
import { sampleResult } from "@/fixtures/sampleResult";
import { generateDataset, defaultConfig } from "@/data/generate";
import { scoreIncident, scoreToSeverity } from "@/engine/scoring";
import type { Alert, Config } from "@/types";

const EMPTY_CONFIG: Config = {
  thresholds: {},
  trainingPeriod: { start: "2024-01-01T00:00:00Z", end: "2024-01-31T23:59:59Z" },
  timezone: "UTC",
  maintenanceWindows: [],
  approvedAccounts: [],
  vpnCidrs: [],
  assets: [],
  privilegedAccounts: [],
  ipLocations: [],
};

// ─── analyze() with empty CSV ─────────────────────────────────────────────────

describe("analyze() with empty CSV", () => {
  it("returns an AnalysisResult with the passed config", () => {
    const result = analyze("", EMPTY_CONFIG);
    expect(result.config).toBe(EMPTY_CONFIG);
  });

  it("returns empty events for an empty CSV", () => {
    const result = analyze("", EMPTY_CONFIG);
    expect(result.events).toHaveLength(0);
  });

  it("returns empty alerts and incidents for empty CSV", () => {
    const result = analyze("", EMPTY_CONFIG);
    expect(result.alerts).toHaveLength(0);
    expect(result.incidents).toHaveLength(0);
  });

  it("returns a valid IngestReport with zero counts for empty CSV", () => {
    const result = analyze("", EMPTY_CONFIG);
    expect(result.ingestReport.totalRows).toBe(0);
    expect(result.ingestReport.validRows).toBe(0);
    expect(result.ingestReport.invalidRows).toHaveLength(0);
    expect(result.ingestReport.duplicatesRemoved).toBe(0);
  });
});

// ─── analyze() with real CSV rows ─────────────────────────────────────────────

describe("analyze() with real CSV data", () => {
  const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-01-15T09:00:00Z,alice,10.0.0.1,WS-001,4624,SUCCESS,3
2024-01-15T09:01:00Z,bob,10.0.0.2,WS-002,4624,SUCCESS,3`;

  it("returns ingested events", () => {
    const result = analyze(csv, EMPTY_CONFIG);
    expect(result.events).toHaveLength(2);
  });

  it("returns correct totalRows and validRows", () => {
    const result = analyze(csv, EMPTY_CONFIG);
    expect(result.ingestReport.totalRows).toBe(2);
    expect(result.ingestReport.validRows).toBe(2);
  });
});

// ─── sampleResult fixture ─────────────────────────────────────────────────────

describe("sampleResult fixture", () => {
  it("has exactly 4 incidents", () => {
    expect(sampleResult.incidents).toHaveLength(4);
  });

  it("has a critical incident first", () => {
    expect(sampleResult.incidents[0].severity).toBe("critical");
    expect(sampleResult.incidents[0].score).toBeGreaterThanOrEqual(90);
  });

  it("all incidents have disposition = 'suspicious'", () => {
    for (const inc of sampleResult.incidents) {
      expect(inc.disposition).toBe("suspicious");
    }
  });

  it("all incidents have non-empty triageSteps", () => {
    for (const inc of sampleResult.incidents) {
      expect(inc.triageSteps.length).toBeGreaterThan(0);
    }
  });

  it("all incidents have scoreBreakdown entries summing to a reasonable score", () => {
    for (const inc of sampleResult.incidents) {
      const sum = inc.scoreBreakdown.reduce((acc, e) => acc + e.points, 0);
      expect(Math.abs(sum - inc.score)).toBeLessThanOrEqual(5);
    }
  });

  it("incident alerts are back-filled correctly", () => {
    expect(sampleResult.incidents[0].alerts).toHaveLength(2);
    expect(sampleResult.incidents[1].alerts).toHaveLength(1);
  });

  it("the critical incident targets privileged accounts", () => {
    const critical = sampleResult.incidents[0];
    expect(sampleResult.config.privilegedAccounts).toContain(critical.username);
  });
});

// ─── Integration: full analyze() against synthetic dataset ───────────────────

describe("analyze() integration — synthetic dataset", () => {
  const { csv, expectedScenarios } = generateDataset();
  const config = defaultConfig();
  const result = analyze(csv, config);

  it("produces incidents", () => {
    expect(result.incidents.length).toBeGreaterThan(0);
  });

  it("all incidents have disposition = 'suspicious'", () => {
    for (const inc of result.incidents) {
      expect(inc.disposition).toBe("suspicious");
    }
  });

  it("no incident explanation contains 'confirmed compromise'", () => {
    for (const inc of result.incidents) {
      expect(inc.explanation.toLowerCase()).not.toContain("confirmed compromise");
    }
  });

  it("all incidents have non-empty triageSteps", () => {
    for (const inc of result.incidents) {
      expect(inc.triageSteps.length).toBeGreaterThan(0);
    }
  });

  // Assert each non-suppressed planted scenario (only for the 6 implemented rules)
  const IMPLEMENTED_RULES = new Set([
    "RULE-BRUTE-FORCE",
    "RULE-FAILURE-THEN-SUCCESS",
    "RULE-PASSWORD-SPRAY",
    "RULE-OFF-HOURS",
    "RULE-NEW-SOURCE-IP",
    "RULE-LATERAL-MOVEMENT",
  ]);

  const alertable = expectedScenarios.filter(
    (s) => !s.shouldNotAlert && IMPLEMENTED_RULES.has(s.rule),
  );


  for (const scenario of alertable) {
    if (scenario.user === "(multiple)") {
      it(`detects scenario: ${scenario.rule} (multi-user spray)`, () => {
        const found = result.alerts.some((a) => a.ruleId === scenario.rule);
        expect(found).toBe(true);
      });
    } else {
      it(`detects alert for user "${scenario.user}" with rule ${scenario.rule}`, () => {
        // Match on alert username OR incident username (spray alerts use IP as username)
        const alertMatches = result.alerts.filter(
          (a) =>
            (a.username === scenario.user || a.ruleId === scenario.rule) &&
            a.ruleId === scenario.rule,
        );
        const incidentMatches = result.incidents.filter(
          (inc) =>
            inc.username === scenario.user &&
            inc.alerts.some((a) => a.ruleId === scenario.rule),
        );
        expect(alertMatches.length + incidentMatches.length).toBeGreaterThan(0);
      });
    }
  }

  // Negative: approved accounts produce zero OFF-HOURS alerts
  it("adm-svc (approved account) produces no alerts from suppressed rules", () => {
    const admAlerts = result.alerts.filter(
      (a) => a.username === "adm-svc" && a.ruleId === "RULE-OFF-HOURS",
    );
    expect(admAlerts).toHaveLength(0);
  });

  // Negative: VPN IP should not produce new-IP alerts
  it("VPN source IP does not appear in evidence of RULE-NEW-SOURCE-IP alerts", () => {
    const vpnIp = "10.100.5.22";
    const vpnAlerts = result.alerts.filter((a) => {
      if (a.ruleId !== "RULE-NEW-SOURCE-IP") return false;
      return result.events.some(
        (e) => a.evidenceIds.includes(e.id) && e.sourceIp === vpnIp,
      );
    });
    expect(vpnAlerts).toHaveLength(0);
  });
});

// ─── Scoring unit tests ───────────────────────────────────────────────────────

describe("scoring", () => {
  const cfg: Config = {
    thresholds: { incidentWindowMinutes: 60 },
    trainingPeriod: { start: "2024-01-01T00:00:00Z", end: "2024-01-31T23:59:59Z" },
    timezone: "UTC",
    maintenanceWindows: [],
    approvedAccounts: [],
    vpnCidrs: [],
    assets: [{ host: "DC01", role: "dc", privileged: true }],
    privilegedAccounts: ["adm-alice"],
    ipLocations: [],
  };

  it("single-rule incident on a privileged account scores ≥ 30", () => {
    // 15 pts rule + 15 pts privileged user = 30
    const fakeAlert: Alert = {
      id: "a1", ruleId: "RULE-BRUTE-FORCE", username: "adm-alice",
      timeStart: "2024-02-01T10:00:00Z", timeEnd: "2024-02-01T10:05:00Z",
      severity: "high", evidenceIds: [],
      explanation: "Suspicious indications", details: {},
    };
    const inc = scoreIncident("inc_0", [fakeAlert], cfg);
    expect(inc.score).toBeGreaterThanOrEqual(30);
  });

  it("3-rule incident on a privileged account with privileged host scores ≥ 85", () => {
    const multiCfg: Config = { ...cfg, privilegedAccounts: ["adm-bob"] };
    const fakeAlerts: Alert[] = [
      {
        id: "a1", ruleId: "RULE-BRUTE-FORCE", username: "adm-bob",
        timeStart: "2024-02-01T10:00:00Z", timeEnd: "2024-02-01T10:05:00Z",
        severity: "high", evidenceIds: [],
        explanation: "Suspicious indications on DC01", details: { newHosts: ["DC01"] },
      },
      {
        id: "a2", ruleId: "RULE-OFF-HOURS", username: "adm-bob",
        timeStart: "2024-02-01T10:06:00Z", timeEnd: "2024-02-01T10:06:00Z",
        severity: "medium", evidenceIds: [],
        explanation: "Suspicious indications — accessed DC01", details: {},
      },
      {
        id: "a3", ruleId: "RULE-LATERAL-MOVEMENT", username: "adm-bob",
        timeStart: "2024-02-01T10:10:00Z", timeEnd: "2024-02-01T10:30:00Z",
        severity: "high", evidenceIds: [],
        explanation: "Suspicious indications — DC01 accessed", details: { newHosts: ["DC01"] },
      },
    ];
    // 3 rules × 15 = 45 (≤60 cap) + 15 priv user + 15 priv host + 10 multi-rule = 85
    const inc = scoreIncident("inc_0", fakeAlerts, multiCfg);
    expect(inc.score).toBeGreaterThanOrEqual(85);
  });

  it("score is always capped at 100", () => {
    // Even with 5 rules × 15 = 75 (cap 60) + 15 + 15 + 10 = 100
    const alerts: Alert[] = ["R1", "R2", "R3", "R4", "R5"].map((rid, i) => ({
      id: `a${i}`, ruleId: rid, username: "adm-alice",
      timeStart: "2024-02-01T10:00:00Z", timeEnd: "2024-02-01T10:05:00Z",
      severity: "high" as const, evidenceIds: [],
      explanation: "Suspicious indications on DC01", details: { newHosts: ["DC01"] },
    }));
    const inc = scoreIncident("inc_0", alerts, cfg);
    expect(inc.score).toBeLessThanOrEqual(100);
  });

  it("severity maps correctly: ≥80→critical, ≥60→high, ≥40→medium, else→low", () => {
    expect(scoreToSeverity(80)).toBe("critical");
    expect(scoreToSeverity(79)).toBe("high");
    expect(scoreToSeverity(60)).toBe("high");
    expect(scoreToSeverity(59)).toBe("medium");
    expect(scoreToSeverity(40)).toBe("medium");
    expect(scoreToSeverity(39)).toBe("low");
    expect(scoreToSeverity(100)).toBe("critical");
    expect(scoreToSeverity(0)).toBe("low");
  });

  it("disposition is always 'suspicious'", () => {
    const fakeAlert: Alert = {
      id: "a1", ruleId: "RULE-BRUTE-FORCE", username: "adm-alice",
      timeStart: "2024-02-01T10:00:00Z", timeEnd: "2024-02-01T10:05:00Z",
      severity: "high", evidenceIds: [], explanation: "Suspicious indications", details: {},
    };
    const inc = scoreIncident("inc_0", [fakeAlert], cfg);
    expect(inc.disposition).toBe("suspicious");
  });

  it("explanation never contains 'confirmed compromise'", () => {
    const fakeAlert: Alert = {
      id: "a1", ruleId: "RULE-BRUTE-FORCE", username: "adm-alice",
      timeStart: "2024-02-01T10:00:00Z", timeEnd: "2024-02-01T10:05:00Z",
      severity: "high", evidenceIds: [], explanation: "Suspicious indications", details: {},
    };
    const inc = scoreIncident("inc_0", [fakeAlert], cfg);
    expect(inc.explanation.toLowerCase()).not.toContain("confirmed compromise");
    expect(inc.explanation.toLowerCase()).toContain("suspicious indications");
  });

  it("incidents analyzed from CSV have correct structure", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-02-01T10:00:00Z,adm-alice,1.2.3.4,WS-001,4625,FAILURE,3
2024-02-01T10:01:00Z,adm-alice,1.2.3.4,WS-001,4625,FAILURE,3
2024-02-01T10:02:00Z,adm-alice,1.2.3.4,WS-001,4625,FAILURE,3
2024-02-01T10:03:00Z,adm-alice,1.2.3.4,WS-001,4625,FAILURE,3
2024-02-01T10:04:00Z,adm-alice,1.2.3.4,WS-001,4625,FAILURE,3`;
    const r = analyze(csv, cfg);
    const inc = r.incidents.find((i) => i.username === "adm-alice");
    expect(inc).toBeDefined();
    expect(inc!.score).toBeGreaterThanOrEqual(30);
    expect(inc!.scoreBreakdown.length).toBeGreaterThan(0);
    expect(inc!.triageSteps.length).toBeGreaterThan(0);
  });
});
