/**
 * Cross-variant attack pattern detection tests.
 * Owner: Person A
 *
 * Verifies that the same brute-force attack pattern is consistently detected
 * across different header naming styles, timestamp representations, and when
 * optional columns (like sourceIp) are omitted.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "@/engine/index";
import { scanFolder } from "../scripts/scan";
import type { Config } from "@/types";

const FIXTURES_DIR = path.resolve(__dirname, "fixtures");

const TEST_CONFIG: Config = {
  thresholds: {
    failureCount: 5,
    failureWindowMinutes: 10,
    burstFailures: 3,
    burstWindowMinutes: 15,
  },
  trainingPeriod: {
    start: "2024-01-01T00:00:00Z",
    end: "2024-01-31T23:59:59Z", // All test events are in March 2024, safely in detection window
  },
  timezone: "UTC",
  maintenanceWindows: [],
  approvedAccounts: [],
  vpnCidrs: [],
  assets: [],
  privilegedAccounts: [],
  ipLocations: [],
};

describe("Step 10: Cross-variant attack pattern detection", () => {
  const fullColumnVariants = [
    {
      name: "Canonical ISO 8601",
      file: "header_canonical_iso.csv",
    },
    {
      name: "Windows Event Export (US Slash AM/PM)",
      file: "header_windows_export_us_slash.csv",
    },
    {
      name: "Sysmon (Epoch seconds)",
      file: "header_sysmon_epoch.csv",
    },
    {
      name: "Snake Case (Slash YMD)",
      file: "header_snake_case_slash_ymd.csv",
    },
    {
      name: "Dot Notation (Dash Date)",
      file: "header_dot_notation_dash_date.csv",
    },
  ];

  for (const variant of fullColumnVariants) {
    describe(`Variant: ${variant.name} (${variant.file})`, () => {
      const csvPath = path.join(FIXTURES_DIR, variant.file);
      const csvText = fs.readFileSync(csvPath, "utf-8");
      const result = analyze(csvText, TEST_CONFIG);

      it("ingests all rows with zero timestamp or format rejection", () => {
        expect(result.ingestReport.totalRows).toBe(7);
        expect(result.events).toHaveLength(7);
        // Genuine invalid rows should be zero
        const nonSkipInvalid = result.ingestReport.invalidRows.filter(
          (r) => !r.reason.startsWith("skipped: "),
        );
        expect(nonSkipInvalid).toHaveLength(0);
      });

      it("normalizes the victim username consistently", () => {
        for (const evt of result.events) {
          expect(evt.username).toBe("victim_user");
        }
      });

      it("detects RULE-BRUTE-FORCE alert", () => {
        const bruteForceAlerts = result.alerts.filter(
          (a) => a.ruleId === "RULE-BRUTE-FORCE",
        );
        expect(bruteForceAlerts.length).toBeGreaterThanOrEqual(1);
        expect(bruteForceAlerts[0].username).toBe("victim_user");
        expect(bruteForceAlerts[0].severity).toBe("high");
        expect(bruteForceAlerts[0].explanation.toLowerCase()).toContain(
          "suspicious indications",
        );
      });

      it("detects RULE-FAILURE-THEN-SUCCESS alert", () => {
        const burstAlerts = result.alerts.filter(
          (a) => a.ruleId === "RULE-FAILURE-THEN-SUCCESS",
        );
        expect(burstAlerts.length).toBeGreaterThanOrEqual(1);
        expect(burstAlerts[0].username).toBe("victim_user");
        expect(burstAlerts[0].severity).toBe("critical");
        expect(burstAlerts[0].details["sourceIp"]).toBe("198.51.100.50");
      });

      it("groups alerts into at least one scored incident", () => {
        expect(result.incidents.length).toBeGreaterThanOrEqual(1);
        const incident = result.incidents[0];
        expect(incident.username).toBe("victim_user");
        expect(["critical", "high", "medium", "low"]).toContain(incident.severity);
        expect(incident.disposition).toBe("suspicious");
        expect(incident.score).toBeGreaterThan(0);
      });
    });
  }

  describe("Variant: missing_columns.csv (Missing sourceIp)", () => {
    const csvPath = path.join(FIXTURES_DIR, "missing_columns.csv");
    const csvText = fs.readFileSync(csvPath, "utf-8");
    const result = analyze(csvText, TEST_CONFIG);

    it("ingests rows without crashing", () => {
      expect(result.ingestReport.totalRows).toBe(7);
      expect(result.events).toHaveLength(7);
    });

    it("records rule skips for rules requiring sourceIp", () => {
      const skipReasons = result.ingestReport.invalidRows.filter((r) =>
        r.reason.startsWith("skipped: missing sourceIp"),
      );
      expect(skipReasons.length).toBeGreaterThanOrEqual(1);
      const skippedRuleIds = skipReasons.map((r) => r.row);
      expect(skippedRuleIds).toContain("RULE-FAILURE-THEN-SUCCESS");
    });

    it("STILL detects RULE-BRUTE-FORCE because it only requires username and result", () => {
      const bruteForceAlerts = result.alerts.filter(
        (a) => a.ruleId === "RULE-BRUTE-FORCE",
      );
      expect(bruteForceAlerts.length).toBeGreaterThanOrEqual(1);
      expect(bruteForceAlerts[0].username).toBe("victim_user");
      expect(bruteForceAlerts[0].severity).toBe("high");
    });
  });

  describe("Step 9: Batch runner scanFolder integration", () => {
    it("scans tests/fixtures folder and generates output/summary.json", () => {
      const summary = scanFolder("tests/fixtures");
      expect(summary.totalFiles).toBeGreaterThanOrEqual(6);

      const outputPath = path.resolve(process.cwd(), "output/summary.json");
      expect(fs.existsSync(outputPath)).toBe(true);

      const savedJson = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      expect(savedJson.totalFiles).toBe(summary.totalFiles);
      expect(savedJson.files.length).toBe(summary.totalFiles);

      // Verify that each file has required metadata
      for (const fileResult of savedJson.files) {
        expect(fileResult.rowsRead).toBe(7);
        expect(fileResult.columnMapping).toBeDefined();
        expect(fileResult.rulesRun).toBeDefined();
        expect(fileResult.alertsPerRule).toBeDefined();
        expect(fileResult.alertsPerRule["RULE-BRUTE-FORCE"]).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
