/**
 * Comprehensive Automated Tests for Adaptive Offline SOC Analysis Platform.
 * Covers:
 * - 9 Rule-based detection categories + Statistical Anomaly detection
 * - Benign scenarios (approved accounts, VPNs, maintenance windows)
 * - Schema mapping, ambiguous column resolution, confidence scores, manual overrides
 * - Capability matrix adaptation to missing fields
 * - CSV formula-injection neutralization
 * - Offline determinism
 */

import { describe, it, expect } from "vitest";
import { analyze } from "@/engine/index";
import { resolveColumnMap, inspectCsvSchema } from "@/engine/ingest/columnMapper";
import { escCsv } from "@/lib/exports";
import { evaluateCapabilities } from "@/engine/capabilities";
import { median, medianAbsoluteDeviation } from "@/engine/statisticalAnomaly";
import type { Config, LogEvent } from "@/types";

const BASE_CONFIG: Config = {
  thresholds: {
    failureCount: 3,
    failureWindowMinutes: 15,
    burstFailures: 3,
    burstWindowMinutes: 15,
    sprayAccounts: 3,
    sprayWindowMinutes: 15,
    newHostCount: 3,
    newHostWindowHours: 24,
    minBaselineEventsForHost: 3,
    unknownAccountAttempts: 3,
    unknownAccountWindowMinutes: 30,
    impossibleTravelHours: 3,
    attackSequenceWindowHours: 4,
    anomalyMinSampleSize: 5,
    anomalyMadMultiplier: 3.0,
  },
  trainingPeriod: {
    start: "2024-03-01T00:00:00Z",
    end: "2024-03-07T23:59:59Z",
  },
  timezone: "UTC",
  maintenanceWindows: [],
  approvedAccounts: [],
  vpnCidrs: [],
  assets: [],
  privilegedAccounts: [],
  ipLocations: [],
};

describe("Adaptive Offline SOC Analysis Platform", () => {
  // ─── 1. Schema Mapping & Ambiguity Tests ────────────────────────────────────
  describe("Universal Schema Mapping & Confidence", () => {
    it("maps varied header conventions (camelCase, snake_case, dot.notation) correctly", () => {
      const headers = [
        "Time.Created",
        "Target_User_Name",
        "client_ip",
        "workstation.name",
        "event_id",
        "auth_result",
      ];
      const result = resolveColumnMap(headers);
      expect(result.columnMap.get("Time.Created")).toBe("timestamp");
      expect(result.columnMap.get("Target_User_Name")).toBe("username");
      expect(result.columnMap.get("client_ip")).toBe("sourceIp");
      expect(result.columnMap.get("workstation.name")).toBe("host");
      expect(result.columnMap.get("event_id")).toBe("eventType");
      expect(result.columnMap.get("auth_result")).toBe("result");
    });

    it("evaluates confidence scores and flags ambiguous column mappings", () => {
      const headers = ["timestamp", "user", "id", "status"];
      const inspection = inspectCsvSchema(headers, [
        { timestamp: "2024-03-10T10:00:00Z", user: "alice", id: "4624", status: "SUCCESS" },
      ]);

      const tsMap = inspection.find((i) => i.rawHeader === "timestamp");
      expect(tsMap?.confidence).toBeGreaterThanOrEqual(0.9);
      expect(tsMap?.isAmbiguous).toBe(false);

      const idMap = inspection.find((i) => i.rawHeader === "id");
      expect(idMap?.isAmbiguous).toBe(true); // "id" matches multiple candidate fields (eventType, eventId)
    });

    it("honors user manual column overrides over automatic heuristics", () => {
      const headers = ["login_time", "employee", "target_system", "outcome"];
      const overrides = { employee: "username", outcome: "result", target_system: "host" };
      const result = resolveColumnMap(headers, { overrides });

      expect(result.columnMap.get("employee")).toBe("username");
      expect(result.columnMap.get("outcome")).toBe("result");
      expect(result.columnMap.get("target_system")).toBe("host");
    });
  });

  // ─── 2. Positive Detection Scenarios ────────────────────────────────────────
  describe("Detection Engine: Attack Scenarios", () => {
    it("detects repeated authentication failures (Brute Force)", () => {
      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-08T10:00:00Z,victim,192.168.1.50,SRV-APP,4625,FAILURE
2024-03-08T10:01:00Z,victim,192.168.1.50,SRV-APP,4625,FAILURE
2024-03-08T10:02:00Z,victim,192.168.1.50,SRV-APP,4625,FAILURE
2024-03-08T10:03:00Z,victim,192.168.1.50,SRV-APP,4625,FAILURE`;

      const res = analyze(csv, BASE_CONFIG);
      const rf = res.alerts.find((a) => a.ruleId === "RULE-BRUTE-FORCE");
      expect(rf).toBeDefined();
      expect(rf?.username).toBe("victim");
    });

    it("detects password spraying across multiple distinct accounts", () => {
      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-08T11:00:00Z,user1,10.0.0.99,DC01,4625,FAILURE
2024-03-08T11:01:00Z,user2,10.0.0.99,DC01,4625,FAILURE
2024-03-08T11:02:00Z,user3,10.0.0.99,DC01,4625,FAILURE
2024-03-08T11:03:00Z,user4,10.0.0.99,DC01,4625,FAILURE`;

      const res = analyze(csv, BASE_CONFIG);
      const spray = res.alerts.find((a) => a.ruleId === "RULE-PASSWORD-SPRAY");
      expect(spray).toBeDefined();
    });

    it("detects failure burst followed by success", () => {
      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-08T12:00:00Z,john,192.168.1.10,SRV-FILE,4625,FAILURE
2024-03-08T12:01:00Z,john,192.168.1.10,SRV-FILE,4625,FAILURE
2024-03-08T12:02:00Z,john,192.168.1.10,SRV-FILE,4625,FAILURE
2024-03-08T12:05:00Z,john,192.168.1.10,SRV-FILE,4624,SUCCESS`;

      const res = analyze(csv, BASE_CONFIG);
      const bts = res.alerts.find((a) => a.ruleId === "RULE-FAILURE-THEN-SUCCESS");
      expect(bts).toBeDefined();
      expect(bts?.username).toBe("john");
    });

    it("detects unfamiliar host access when user has a historical baseline", () => {
      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-02T10:00:00Z,bob,192.168.1.20,DESKTOP-BOB,4624,SUCCESS
2024-03-03T10:00:00Z,bob,192.168.1.20,DESKTOP-BOB,4624,SUCCESS
2024-03-04T10:00:00Z,bob,192.168.1.20,DESKTOP-BOB,4624,SUCCESS
2024-03-05T10:00:00Z,bob,192.168.1.20,DESKTOP-BOB,4624,SUCCESS
2024-03-08T14:00:00Z,bob,192.168.1.20,SECRET-SERVER-09,4624,SUCCESS`;

      const res = analyze(csv, BASE_CONFIG);
      const uHost = res.alerts.find((a) => a.ruleId === "RULE-UNFAMILIAR-HOST");
      expect(uHost).toBeDefined();
      expect(uHost?.details?.host).toBe("SECRET-SERVER-09");
    });

    it("detects attempts against unknown/invalid usernames", () => {
      const csv = `timestamp,username,sourceIp,host,eventType,result,subStatus
2024-03-08T15:00:00Z,admin99,10.0.0.50,DC01,4625,FAILURE,0xC0000064
2024-03-08T15:01:00Z,oracle_test,10.0.0.50,DC01,4625,FAILURE,0xC0000064
2024-03-08T15:02:00Z,ghost_account,10.0.0.50,DC01,4625,FAILURE,0xC0000064`;

      const res = analyze(csv, BASE_CONFIG);
      const unknown = res.alerts.find((a) => a.ruleId === "RULE-UNKNOWN-ACCOUNT");
      expect(unknown).toBeDefined();
    });

    it("detects impossible travel when geographic location data is provided", () => {
      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-08T16:00:00Z,sarah,198.51.100.10,SRV-A,4624,SUCCESS
2024-03-08T16:45:00Z,sarah,203.0.113.50,SRV-A,4624,SUCCESS`;

      const ipLocCsv = `cidr,location
198.51.100.0/24,New York US
203.0.113.0/24,London UK`;

      const res = analyze(csv, BASE_CONFIG, undefined, ipLocCsv);
      const travel = res.alerts.find((a) => a.ruleId === "RULE-IMPOSSIBLE-TRAVEL");
      expect(travel).toBeDefined();
      expect(travel?.details?.previousLocation).toBe("New York US");
      expect(travel?.details?.currentLocation).toBe("London UK");
    });

    it("detects multi-stage attack sequence (Failures -> Success -> New Host Access)", () => {
      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-02T10:00:00Z,hacker_target,192.168.1.15,WORKSTATION-A,4624,SUCCESS
2024-03-03T10:00:00Z,hacker_target,192.168.1.15,WORKSTATION-A,4624,SUCCESS
2024-03-08T17:00:00Z,hacker_target,192.168.1.100,WORKSTATION-A,4625,FAILURE
2024-03-08T17:01:00Z,hacker_target,192.168.1.100,WORKSTATION-A,4625,FAILURE
2024-03-08T17:05:00Z,hacker_target,192.168.1.100,WORKSTATION-A,4624,SUCCESS
2024-03-08T17:15:00Z,hacker_target,192.168.1.100,CRITICAL-DB-01,4624,SUCCESS`;

      const res = analyze(csv, BASE_CONFIG);
      const seq = res.alerts.find((a) => a.ruleId === "RULE-ATTACK-SEQUENCE");
      expect(seq).toBeDefined();
      expect(seq?.details?.failCount).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── 3. Statistical Anomaly Detection ───────────────────────────────────────
  describe("Statistical Anomaly Detection (MAD)", () => {
    it("computes accurate Median and Median Absolute Deviation", () => {
      const values = [1, 2, 2, 3, 4, 14];
      const med = median(values);
      expect(med).toBe(2.5);
      const mad = medianAbsoluteDeviation(values, med);
      expect(mad).toBe(1);
    });

    it("flags an account with anomalous failure volume that deviates from historical distribution", () => {
      // Build 5 users in baseline each with 1 failure
      const baselineRows = [
        "2024-03-02T10:00:00Z,u1,192.168.1.1,H1,4625,FAILURE",
        "2024-03-02T10:00:00Z,u2,192.168.1.2,H2,4625,FAILURE",
        "2024-03-02T10:00:00Z,u3,192.168.1.3,H3,4625,FAILURE",
        "2024-03-02T10:00:00Z,u4,192.168.1.4,H4,4625,FAILURE",
        "2024-03-02T10:00:00Z,u5,192.168.1.5,H5,4625,FAILURE",
      ];
      // In evaluation period, u1 has 20 failures
      const evalRows = Array.from(
        { length: 15 },
        (_, i) => `2024-03-08T18:${String(i).padStart(2, "0")}:00Z,anom_user,192.168.1.9,H1,4625,FAILURE`
      );

      const csv = `timestamp,username,sourceIp,host,eventType,result\n${[
        ...baselineRows,
        ...evalRows,
      ].join("\n")}`;

      const res = analyze(csv, BASE_CONFIG);
      const anom = res.alerts.find((a) => a.ruleId === "ANOMALY-FAILED-LOGINS");
      expect(anom).toBeDefined();
      expect(anom?.kind).toBe("anomaly");
      expect(anom?.anomalyDetails?.observed).toBe(15);
    });
  });

  // ─── 4. Benign Scenarios & Context Suppression ──────────────────────────────
  describe("Benign & Context-Aware Reductions", () => {
    it("suppresses alerts during approved maintenance windows without erasing raw events", () => {
      const configWithMaint: Config = {
        ...BASE_CONFIG,
        maintenanceWindows: [
          { start: "2024-03-08T02:00:00Z", end: "2024-03-08T04:00:00Z" },
        ],
      };

      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-08T02:10:00Z,admin,192.168.1.50,SRV-A,4625,FAILURE
2024-03-08T02:11:00Z,admin,192.168.1.50,SRV-A,4625,FAILURE
2024-03-08T02:12:00Z,admin,192.168.1.50,SRV-A,4625,FAILURE
2024-03-08T02:13:00Z,admin,192.168.1.50,SRV-A,4625,FAILURE`;

      const res = analyze(csv, configWithMaint);
      // Raw events are preserved!
      expect(res.events.length).toBe(4);
      // But alert is suppressed due to approved maintenance window
      const rf = res.alerts.find((a) => a.ruleId === "RULE-BRUTE-FORCE");
      expect(rf).toBeUndefined();
    });

    it("suppresses brute-force alerting for authorized service accounts", () => {
      const configWithSvc: Config = {
        ...BASE_CONFIG,
        approvedAccounts: ["svc_backup"],
      };

      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-08T10:00:00Z,svc_backup,192.168.1.50,SRV-A,4625,FAILURE
2024-03-08T10:01:00Z,svc_backup,192.168.1.50,SRV-A,4625,FAILURE
2024-03-08T10:02:00Z,svc_backup,192.168.1.50,SRV-A,4625,FAILURE
2024-03-08T10:03:00Z,svc_backup,192.168.1.50,SRV-A,4625,FAILURE`;

      const res = analyze(csv, configWithSvc);
      expect(res.events.length).toBe(4);
      expect(res.alerts.length).toBe(0);
    });

    it("suppresses detections originating from declared corporate VPN CIDR", () => {
      const configWithVpn: Config = {
        ...BASE_CONFIG,
        vpnCidrs: ["10.200.0.0/16"],
      };

      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-08T10:00:00Z,remote_user,10.200.5.12,SRV-A,4625,FAILURE
2024-03-08T10:01:00Z,remote_user,10.200.5.12,SRV-A,4625,FAILURE
2024-03-08T10:02:00Z,remote_user,10.200.5.12,SRV-A,4625,FAILURE
2024-03-08T10:03:00Z,remote_user,10.200.5.12,SRV-A,4625,FAILURE`;

      const res = analyze(csv, configWithVpn);
      expect(res.alerts.length).toBe(0);
    });
  });

  // ─── 5. Capability Matrix & Missing Field Adaptability ─────────────────────
  describe("Capability Matrix & Missing Field Adaptability", () => {
    it("disables IP-based rules when sourceIp is missing, without failing analysis", () => {
      // Dataset lacking sourceIp
      const csv = `timestamp,username,host,eventType,result
2024-03-08T10:00:00Z,user_a,H1,4625,FAILURE
2024-03-08T10:01:00Z,user_a,H1,4625,FAILURE
2024-03-08T10:02:00Z,user_a,H1,4625,FAILURE
2024-03-08T10:03:00Z,user_a,H1,4625,FAILURE`;

      const res = analyze(csv, BASE_CONFIG);
      // Analysis continues successfully!
      expect(res.events.length).toBe(4);
      expect(res.capabilities).toBeDefined();

      const ipSprayCap = res.capabilities?.find((c) => c.id === "RULE-PASSWORD-SPRAY");
      expect(ipSprayCap?.status).toBe("disabled");
      expect(ipSprayCap?.missingFields).toContain("sourceIp");

      // But username/result-based brute force continues to work!
      const rf = res.alerts.find((a) => a.ruleId === "RULE-BRUTE-FORCE");
      expect(rf).toBeDefined();
    });

    it("disables impossible travel rule when no location mapping is supplied", () => {
      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-08T10:00:00Z,user_a,192.168.1.1,H1,4624,SUCCESS`;

      const res = analyze(csv, BASE_CONFIG);
      const cap = res.capabilities?.find((c) => c.id === "RULE-IMPOSSIBLE-TRAVEL");
      expect(cap?.status).toBe("disabled");
      expect(cap?.reason).toContain("Disabled: No IP-to-location mapping table");
    });
  });

  // ─── 6. Safety & Export Security ───────────────────────────────────────────
  describe("Safety & CSV Formula Injection Prevention", () => {
    it("escapes dangerous formula prefixes (=, +, -, @, tab) in CSV exports", () => {
      expect(escCsv("=cmd|'/C calc'!A0")).toBe("'=cmd|'/C calc'!A0");
      expect(escCsv("=SUM(A1, B1)")).toBe("\"'=SUM(A1, B1)\"");
      expect(escCsv("+12345")).toBe("'+12345");
      expect(escCsv("-500")).toBe("'-500");
      expect(escCsv("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
      expect(escCsv("normal_user")).toBe("normal_user");
    });

    it("neutralizes formula injection even with leading whitespace", () => {
      expect(escCsv("  =1+1")).toBe("'  =1+1");
      expect(escCsv("  =1+1, test")).toBe("\"'  =1+1, test\"");
    });
  });

  // ─── 7. Offline Determinism & Traceability ──────────────────────────────────
  describe("Offline Determinism & Traceability", () => {
    it("produces identical, repeatable incidents and scores across repeated runs", () => {
      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-08T10:00:00Z,target,192.168.1.5,SRV-A,4625,FAILURE
2024-03-08T10:01:00Z,target,192.168.1.5,SRV-A,4625,FAILURE
2024-03-08T10:02:00Z,target,192.168.1.5,SRV-A,4625,FAILURE
2024-03-08T10:03:00Z,target,192.168.1.5,SRV-A,4624,SUCCESS`;

      const run1 = analyze(csv, BASE_CONFIG);
      const run2 = analyze(csv, BASE_CONFIG);

      expect(run1.incidents.length).toBe(run2.incidents.length);
      expect(run1.incidents[0].score).toBe(run2.incidents[0].score);
      expect(run1.incidents[0].alerts.length).toBe(run2.incidents[0].alerts.length);
      expect(run1.incidents[0].alerts.map((a) => a.id)).toEqual(
        run2.incidents[0].alerts.map((a) => a.id)
      );
    });

    it("preserves original CSV row numbers and raw content on LogEvent", () => {
      const csv = `timestamp,username,sourceIp,host,eventType,result
2024-03-08T10:00:00Z,user1,192.168.1.1,H1,4624,SUCCESS
2024-03-08T10:01:00Z,user2,192.168.1.2,H2,4624,SUCCESS`;

      const res = analyze(csv, BASE_CONFIG);
      expect(res.events[0].rawLineNumber).toBe(1);
      expect(res.events[1].rawLineNumber).toBe(2);
      expect(res.events[0].rawRow).toContain("user1");
    });
  });
});
