import { describe, it, expect } from "vitest";
import {
  parseTimestamp,
  buildParseReport,
} from "@/engine/ingest/timestampParser";
import { ingestCsv } from "@/engine/ingest";
import type { Config, InvalidRow } from "@/types";

const BASE_CONFIG: Config = {
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

describe("timestampParser — epoch seconds and milliseconds by digit count", () => {
  it("parses 10-digit epoch seconds", () => {
    // 1710510181 = 2024-03-15T13:43:01.000Z
    const r = parseTimestamp("1710510181");
    expect(r).toBe("2024-03-15T13:43:01.000Z");
  });

  it("parses epoch seconds with fractional decimal seconds", () => {
    const r = parseTimestamp("1710510181.500");
    expect(r).toBe("2024-03-15T13:43:01.500Z");
  });

  it("parses 13-digit epoch milliseconds", () => {
    // 1710510181000 = 2024-03-15T13:43:01.000Z
    const r = parseTimestamp("1710510181000");
    expect(r).toBe("2024-03-15T13:43:01.000Z");
  });
});

describe("timestampParser — timezone offsets", () => {
  it("handles positive timezone offset +HH:MM", () => {
    // 14:23:01 +05:30 -> 08:53:01 UTC
    const r = parseTimestamp("2024-03-15T14:23:01+05:30");
    expect(r).toBeTruthy();
    const d = new Date(r!);
    expect(d.getUTCHours()).toBe(8);
    expect(d.getUTCMinutes()).toBe(53);
    expect(d.getUTCSeconds()).toBe(1);
  });

  it("handles negative timezone offset -HH:MM", () => {
    // 14:23:01 -04:00 -> 18:23:01 UTC
    const r = parseTimestamp("2024-03-15T14:23:01-04:00");
    expect(r).toBeTruthy();
    const d = new Date(r!);
    expect(d.getUTCHours()).toBe(18);
    expect(d.getUTCMinutes()).toBe(23);
  });

  it("handles 4-digit offset without colon (+0500)", () => {
    const r = parseTimestamp("2024-03-15 14:23:01+0500");
    expect(r).toBeTruthy();
    const d = new Date(r!);
    expect(d.getUTCHours()).toBe(9);
    expect(d.getUTCMinutes()).toBe(23);
  });
});

describe("timestampParser — supported formats in order", () => {
  it("parses standard ISO 8601 with Z", () => {
    const r = parseTimestamp("2024-03-15T14:23:01.500Z");
    expect(r).toBe("2024-03-15T14:23:01.500Z");
  });

  it("parses slash YMD format (2024/03/15 14:23:01)", () => {
    const r = parseTimestamp("2024/03/15 14:23:01");
    expect(r).toBeTruthy();
    const d = new Date(r!);
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(15);
  });

  it("parses US slash MDY format with AM/PM (03/15/2024 2:23:01 PM)", () => {
    const r = parseTimestamp("03/15/2024 2:23:01 PM");
    expect(r).toBeTruthy();
    const d = new Date(r!);
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(14);
  });

  it("parses international DD/MM/YYYY format (15/03/2024 14:23:01)", () => {
    const r = parseTimestamp("15/03/2024 14:23:01");
    expect(r).toBeTruthy();
    const d = new Date(r!);
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(15);
  });

  it("parses DD-Mon-YYYY format (15-Mar-2024 14:23:01)", () => {
    const r = parseTimestamp("15-Mar-2024 14:23:01");
    expect(r).toBeTruthy();
    const d = new Date(r!);
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(15);
  });

  it("rejects invalid timestamps", () => {
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("not-a-date")).toBeNull();
    expect(parseTimestamp("99/99/9999 25:61:99")).toBeNull();
  });
});

describe("buildParseReport & rejected row counting", () => {
  it("counts rejected rows by reason in parseReport", () => {
    const invalidRows: InvalidRow[] = [
      { row: "row1", reason: "Missing field: timestamp" },
      { row: "row2", reason: "Missing field: timestamp" },
      { row: "row3", reason: "Unparseable timestamp: 'bad-date-1'" },
      { row: "row4", reason: "Unparseable timestamp: 'bad-date-2'" },
      { row: "row5", reason: "Malformed CSV header" },
    ];

    const report = buildParseReport(10, 5, invalidRows);
    expect(report.totalRows).toBe(10);
    expect(report.validRows).toBe(5);
    expect(report.rejectedCount).toBe(5);
    expect(report.rejectedByReason["Missing field: timestamp"]).toBe(2);
    expect(report.rejectedByReason["Unparseable timestamp"]).toBe(2);
    expect(report.rejectedByReason["Malformed CSV header"]).toBe(1);
  });

  it("ingestCsv returns parseReport with counted reasons", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-03-15T10:00:00Z,alice,10.0.0.1,DC01,4624,SUCCESS,3
,bob,10.0.0.2,DC01,4624,SUCCESS,3
invalid-ts,carol,10.0.0.3,DC01,4624,SUCCESS,3
another-bad,dave,10.0.0.4,DC01,4624,SUCCESS,3`;

    const { events, report, parseReport } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(1);
    expect(report.validRows).toBe(1);
    expect(report.totalRows).toBe(4);

    expect(parseReport).toBeDefined();
    expect(parseReport.rejectedCount).toBe(3);
    expect(parseReport.rejectedByReason["Missing field: timestamp"]).toBe(1);
    expect(parseReport.rejectedByReason["Unparseable timestamp"]).toBe(2);

    // Also accessible through report
    expect(report.parseReport).toBeDefined();
    expect(report.rejectedByReason?.["Unparseable timestamp"]).toBe(2);
  });
});
