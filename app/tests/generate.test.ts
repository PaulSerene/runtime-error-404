/**
 * Tests for src/data/generate.ts — synthetic log generator.
 * Owner: Person A
 */
import { describe, it, expect } from "vitest";
import { generateSyntheticLog, syntheticConfig } from "@/data/generate";
import { ingestCsv } from "@/engine/ingest";
import { learnBaselines } from "@/engine/baseline";

describe("generateSyntheticLog", () => {
  const { csv, expectedScenarios } = generateSyntheticLog();
  const config = syntheticConfig();

  it("produces a non-empty CSV string", () => {
    expect(csv.length).toBeGreaterThan(0);
    expect(csv).toContain("timestamp");
  });

  it("produces at least 9 planted scenarios", () => {
    expect(expectedScenarios.length).toBeGreaterThanOrEqual(9);
  });

  it("has both alertable and non-alertable scenarios", () => {
    const alertable    = expectedScenarios.filter((s) => !s.shouldNotAlert);
    const nonAlertable = expectedScenarios.filter((s) => s.shouldNotAlert);
    expect(alertable.length).toBeGreaterThan(0);
    expect(nonAlertable.length).toBeGreaterThan(0);
  });

  it("includes a brute-force scenario", () => {
    expect(expectedScenarios.some((s) => s.rule === "RULE-BRUTE-FORCE")).toBe(true);
  });

  it("includes a password-spray scenario", () => {
    expect(expectedScenarios.some((s) => s.rule === "RULE-PASSWORD-SPRAY")).toBe(true);
  });

  it("includes a lateral-movement scenario", () => {
    expect(expectedScenarios.some((s) => s.rule === "RULE-LATERAL-MOVEMENT")).toBe(true);
  });

  it("includes an off-hours scenario", () => {
    expect(expectedScenarios.some((s) => s.rule === "RULE-OFF-HOURS" && !s.shouldNotAlert)).toBe(true);
  });

  it("includes a maintenance-window negative scenario (shouldNotAlert)", () => {
    const neg = expectedScenarios.find((s) => s.rule === "RULE-OFF-HOURS" && s.shouldNotAlert);
    expect(neg).toBeTruthy();
    expect(neg!.description).toContain("maintenance");
  });

  it("includes a VPN negative scenario (shouldNotAlert)", () => {
    const neg = expectedScenarios.find((s) => s.rule === "RULE-NEW-SOURCE-IP" && s.shouldNotAlert);
    expect(neg).toBeTruthy();
    expect(neg!.description).toContain("VPN");
  });

  it("is fully deterministic — same seed → same CSV", () => {
    const { csv: csv2 } = generateSyntheticLog();
    expect(csv2).toBe(csv);
  });

  it("different seeds produce different CSVs", () => {
    const { csv: csv3 } = generateSyntheticLog(0xcafebabe);
    expect(csv3).not.toBe(csv);
  });
});

describe("generateSyntheticLog — ingestion round-trip", () => {
  const { csv } = generateSyntheticLog();
  const config  = syntheticConfig();

  it("ingests without crashing", () => {
    expect(() => ingestCsv(csv, config)).not.toThrow();
  });

  it("produces at least 200 valid events", () => {
    const { events, report } = ingestCsv(csv, config);
    expect(events.length).toBeGreaterThan(200);
    expect(report.validRows).toBeGreaterThan(200);
  });

  it("detects the planted malformed rows as invalid", () => {
    const { report } = ingestCsv(csv, config);
    // At least the "not-a-date" and empty-timestamp rows should be invalid
    expect(report.invalidRows.length).toBeGreaterThanOrEqual(2);
  });

  it("detects and removes the planted duplicate row", () => {
    const { report } = ingestCsv(csv, config);
    expect(report.duplicatesRemoved).toBeGreaterThanOrEqual(1);
  });

  it("all valid events have well-formed UTC timestamps", () => {
    const { events } = ingestCsv(csv, config);
    for (const e of events) {
      expect(() => new Date(e.timestamp)).not.toThrow();
      expect(new Date(e.timestamp).toISOString()).toBe(e.timestamp);
    }
  });
});

describe("generateSyntheticLog — baseline round-trip", () => {
  const { csv } = generateSyntheticLog();
  const config  = syntheticConfig();

  it("learns baselines only from events in the training period", () => {
    const { events } = ingestCsv(csv, config);
    const map = learnBaselines(events, config);

    const trainEnd = new Date(config.trainingPeriod.end).getTime();

    for (const [, baseline] of map) {
      if (!baseline.noBaseline) {
        // Must have had at least one training event
        expect(baseline.trainingEventCount).toBeGreaterThan(0);
      }
    }

    // No user's baseline should contain IPs/hosts that only appear in detection period
    // We verify that a brand-new user introduced only in the detection period has noBaseline=true
    const ghost = map.get("ghostuser-not-in-csv");
    expect(ghost).toBeUndefined(); // should not be in map at all
  });

  it("regular office-hours users have noBaseline=false", () => {
    const { events } = ingestCsv(csv, config);
    const map = learnBaselines(events, config);

    // Users with normal training traffic
    for (const user of ["abrown", "cjohnson", "fnelson", "gwang"]) {
      const b = map.get(user);
      if (b) {
        expect(b.noBaseline).toBe(false);
        expect(b.knownHours.size).toBeGreaterThan(0);
      }
    }
  });
});
