/**
 * Smoke tests for src/engine/index.ts and the sampleResult fixture.
 * Owner: Person A
 */
import { describe, it, expect } from "vitest";
import { analyze } from "@/engine/index";
import { sampleResult } from "@/fixtures/sampleResult";
import type { Config } from "@/types";

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

  it("returns empty alerts and incidents (rule engine stub)", () => {
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
