/**
 * Smoke tests for the engine stub and type contracts.
 * Owner: Person A
 */
import { describe, it, expect } from "vitest";
import { analyze } from "@/engine/index";
import { sampleResult } from "@/fixtures/sampleResult";
import type { Config } from "@/types";

const minimalConfig: Config = {
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

describe("analyze() stub", () => {
  it("returns an AnalysisResult with the passed config", () => {
    const result = analyze("", minimalConfig);
    expect(result.config).toBe(minimalConfig);
  });

  it("returns empty events, alerts, and incidents", () => {
    const result = analyze("", minimalConfig);
    expect(result.events).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
    expect(result.incidents).toHaveLength(0);
  });

  it("returns a valid IngestReport with zero counts", () => {
    const result = analyze("", minimalConfig);
    expect(result.ingestReport.totalRows).toBe(0);
    expect(result.ingestReport.validRows).toBe(0);
    expect(result.ingestReport.invalidRows).toHaveLength(0);
    expect(result.ingestReport.duplicatesRemoved).toBe(0);
  });
});

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
      // Allow ±5 tolerance (fixture rounding)
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
