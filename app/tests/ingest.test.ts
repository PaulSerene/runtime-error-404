/**
 * Tests for src/engine/ingest.ts — ingestion edge cases.
 * Owner: Person A
 */
import { describe, it, expect } from "vitest";
import {
  parseTimestamp,
  fnv1a,
  ingestCsv,
  parseAssetsCsv,
  parseIpLocationCsv,
  ipToInt,
  maskBitsToInt,
  ipInCidr,
  lookupLocation,
  parseCidr,
  normalizeResult,
} from "@/engine/ingest";
import type { Config } from "@/types";

// ─── Minimal config fixture ───────────────────────────────────────────────────

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

// ─── parseTimestamp ───────────────────────────────────────────────────────────

describe("parseTimestamp", () => {
  it("parses a standard ISO 8601 UTC string", () => {
    const r = parseTimestamp("2024-03-15T14:23:01Z");
    expect(r).toBe("2024-03-15T14:23:01.000Z");
  });

  it("parses ISO 8601 with milliseconds", () => {
    const r = parseTimestamp("2024-03-15T14:23:01.500Z");
    expect(r).toBeTruthy();
    expect(new Date(r!).getUTCHours()).toBe(14);
  });

  it("parses ISO 8601 with timezone offset", () => {
    const r = parseTimestamp("2024-03-15T14:23:01+05:30");
    expect(r).toBeTruthy();
    // 14:23 +05:30 = 08:53 UTC
    expect(new Date(r!).getUTCHours()).toBe(8);
    expect(new Date(r!).getUTCMinutes()).toBe(53);
  });

  it("parses YYYY/MM/DD HH:MM:SS (no timezone — treated as UTC)", () => {
    const r = parseTimestamp("2024/03/15 14:23:01");
    expect(r).toBeTruthy();
    expect(new Date(r!).getUTCFullYear()).toBe(2024);
    expect(new Date(r!).getUTCMonth()).toBe(2); // March = 2
    expect(new Date(r!).getUTCDate()).toBe(15);
  });

  it("parses MM/DD/YYYY HH:MM:SS format", () => {
    const r = parseTimestamp("03/15/2024 14:23:01");
    expect(r).toBeTruthy();
    expect(new Date(r!).getUTCFullYear()).toBe(2024);
    expect(new Date(r!).getUTCMonth()).toBe(2);
  });

  it("parses Unix epoch (seconds)", () => {
    const r = parseTimestamp("1710510181");
    expect(r).toBeTruthy();
    expect(new Date(r!).getUTCFullYear()).toBeGreaterThanOrEqual(2024);
  });

  it("returns null for a clearly invalid timestamp", () => {
    expect(parseTimestamp("not-a-date")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseTimestamp("")).toBeNull();
  });

  it("returns null for a plausible-looking but invalid date like 99/99/9999", () => {
    expect(parseTimestamp("99/99/9999 25:61:99")).toBeNull();
  });
});

// ─── fnv1a ────────────────────────────────────────────────────────────────────

describe("fnv1a", () => {
  it("returns a consistent hash for the same input", () => {
    expect(fnv1a("hello")).toBe(fnv1a("hello"));
  });

  it("returns different hashes for different inputs", () => {
    expect(fnv1a("hello")).not.toBe(fnv1a("world"));
  });

  it("returns an 8-character hex string", () => {
    expect(fnv1a("test")).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ─── ingestCsv ────────────────────────────────────────────────────────────────

const GOOD_CSV = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-03-15T10:00:00Z,alice,192.168.1.10,DC01,4624,SUCCESS,3
2024-03-15T10:01:00Z,bob,192.168.1.11,WS-001,4624,SUCCESS,2`;

describe("ingestCsv — happy path", () => {
  it("parses a well-formed CSV into LogEvents", () => {
    const { events, report } = ingestCsv(GOOD_CSV, BASE_CONFIG);
    expect(events).toHaveLength(2);
    expect(report.totalRows).toBe(2);
    expect(report.validRows).toBe(2);
    expect(report.invalidRows).toHaveLength(0);
    expect(report.duplicatesRemoved).toBe(0);
  });

  it("normalises timestamps to UTC ISO format", () => {
    const { events } = ingestCsv(GOOD_CSV, BASE_CONFIG);
    for (const e of events) {
      expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it("gives each event a stable, non-empty id", () => {
    const { events } = ingestCsv(GOOD_CSV, BASE_CONFIG);
    const ids = events.map((e) => e.id);
    expect(ids.every((id) => id.length === 8)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it("stores the original rawRow", () => {
    const { events } = ingestCsv(GOOD_CSV, BASE_CONFIG);
    expect(events[0].rawRow).toContain("alice");
  });
});

describe("ingestCsv — bad timestamps", () => {
  it("puts rows with unparseable timestamps into invalidRows", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
not-a-date,alice,192.168.1.1,DC01,4624,SUCCESS,3
2024-03-15T10:00:00Z,bob,192.168.1.2,WS-001,4624,SUCCESS,3`;
    const { events, report } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(1);
    expect(report.invalidRows).toHaveLength(1);
    expect(report.invalidRows[0].reason).toMatch(/Unparseable timestamp/);
  });

  it("puts rows with missing timestamp into invalidRows", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
,alice,192.168.1.1,DC01,4624,SUCCESS,3`;
    const { events, report } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(0);
    expect(report.invalidRows).toHaveLength(1);
    expect(report.invalidRows[0].reason).toMatch(/Missing field: timestamp/);
  });

  it("handles multiple bad timestamps without crashing", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
99/99/9999,a,1.1.1.1,H1,4624,SUCCESS,3
also-bad,b,2.2.2.2,H2,4624,SUCCESS,3
2024-03-15T10:00:00Z,c,3.3.3.3,H3,4624,SUCCESS,3`;
    const { events, report } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(1);
    expect(report.invalidRows).toHaveLength(2);
    expect(report.totalRows).toBe(3);
  });
});

describe("ingestCsv — deduplication", () => {
  it("removes exact duplicate rows and counts them", () => {
    const row = "2024-03-15T10:00:00Z,alice,192.168.1.1,DC01,4624,SUCCESS,3";
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype\n${row}\n${row}\n${row}`;
    const { events, report } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(1);
    expect(report.duplicatesRemoved).toBe(2);
  });

  it("does not deduplicate rows that differ by even one character", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-03-15T10:00:00Z,alice,192.168.1.1,DC01,4624,SUCCESS,3
2024-03-15T10:00:01Z,alice,192.168.1.1,DC01,4624,SUCCESS,3`;
    const { events, report } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(2);
    expect(report.duplicatesRemoved).toBe(0);
  });
});

describe("ingestCsv — missing optional fields", () => {
  it("records missing optional fields in missingFieldCounts", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-03-15T10:00:00Z,,192.168.1.1,DC01,4624,SUCCESS,3`;
    const { report } = ingestCsv(csv, BASE_CONFIG);
    expect(report.missingFieldCounts["username"]).toBeGreaterThanOrEqual(1);
  });

  it("still creates a valid event when optional fields are missing", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-03-15T10:00:00Z,alice,,,4624,,`;
    const { events } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(1);
    expect(events[0].sourceIp).toBe("");
    expect(events[0].host).toBe("");
  });
});

describe("ingestCsv — column alias mapping", () => {
  it("accepts 'user' instead of 'username'", () => {
    const csv = `timestamp,user,src_ip,dest,eventid,status,logon_type
2024-03-15T10:00:00Z,carol,10.0.0.1,SRV-01,4624,SUCCESS,3`;
    const { events } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(1);
    expect(events[0].username).toBe("carol");
    expect(events[0].sourceIp).toBe("10.0.0.1");
    expect(events[0].host).toBe("SRV-01");
    expect(events[0].eventType).toBe("4624");
  });

  it("accepts 'source_ip' and 'computername' aliases", () => {
    const csv = `datetime,account_name,source_ip,computername,event_id,outcome,auth_type
2024-03-16T09:00:00Z,dave,172.16.0.1,MYPC,4625,FAILURE,2`;
    const { events } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(1);
    expect(events[0].username).toBe("dave");
    expect(events[0].sourceIp).toBe("172.16.0.1");
    expect(events[0].host).toBe("MYPC");
  });
});

// ─── parseAssetsCsv ──────────────────────────────────────────────────────────

describe("parseAssetsCsv", () => {
  it("parses basic host/role/privileged columns", () => {
    const csv = `host,role,privileged
DC01,domain-controller,true
WS-001,user-workstation,false`;
    const assets = parseAssetsCsv(csv);
    expect(assets).toHaveLength(2);
    expect(assets[0].host).toBe("DC01");
    expect(assets[0].privileged).toBe(true);
    expect(assets[1].privileged).toBe(false);
  });

  it("returns empty array for empty input", () => {
    expect(parseAssetsCsv("")).toHaveLength(0);
  });

  it("skips rows with no host", () => {
    const csv = `host,role,privileged\n,no-host-role,false`;
    expect(parseAssetsCsv(csv)).toHaveLength(0);
  });
});

// ─── parseIpLocationCsv ──────────────────────────────────────────────────────

describe("parseIpLocationCsv", () => {
  it("parses basic cidr/location columns", () => {
    const csv = `cidr,location\n192.168.0.0/16,HQ LAN\n10.0.0.0/8,Internal`;
    const locs = parseIpLocationCsv(csv);
    expect(locs).toHaveLength(2);
    expect(locs[0].cidr).toBe("192.168.0.0/16");
    expect(locs[0].location).toBe("HQ LAN");
  });

  it("skips rows with invalid CIDRs", () => {
    const csv = `cidr,location\nnot-a-cidr,Somewhere\n10.0.0.0/8,Internal`;
    const locs = parseIpLocationCsv(csv);
    expect(locs).toHaveLength(1);
  });

  it("returns empty for empty input", () => {
    expect(parseIpLocationCsv("")).toHaveLength(0);
  });
});

// ─── normalizeResult & logonType handling ───────────────────────────────────

describe("normalizeResult", () => {
  it("derives SUCCESS from eventType 4624 when result is missing", () => {
    expect(normalizeResult("", "4624")).toBe("SUCCESS");
    expect(normalizeResult(undefined, "4624")).toBe("SUCCESS");
    expect(normalizeResult(null, "Microsoft-Windows-Security-Auditing: 4624")).toBe("SUCCESS");
  });

  it("derives FAILURE from eventType 4625 when result is missing", () => {
    expect(normalizeResult("", "4625")).toBe("FAILURE");
    expect(normalizeResult(undefined, "4625")).toBe("FAILURE");
    expect(normalizeResult(null, "Event 4625")).toBe("FAILURE");
  });

  it("treats Audit Success/Failure as results", () => {
    expect(normalizeResult("Audit Success")).toBe("SUCCESS");
    expect(normalizeResult("Audit Failure")).toBe("FAILURE");
    expect(normalizeResult("audit success")).toBe("SUCCESS");
    expect(normalizeResult("audit failure")).toBe("FAILURE");
  });

  it("treats 0x0 and zero status codes as SUCCESS", () => {
    expect(normalizeResult("0x0")).toBe("SUCCESS");
    expect(normalizeResult("0x00000000")).toBe("SUCCESS");
    expect(normalizeResult("0")).toBe("SUCCESS");
    expect(normalizeResult("STATUS_SUCCESS")).toBe("SUCCESS");
  });

  it("treats non-zero status codes as FAILURE", () => {
    expect(normalizeResult("0xC000006A")).toBe("FAILURE");
    expect(normalizeResult("0xC000006D")).toBe("FAILURE");
    expect(normalizeResult("0x1")).toBe("FAILURE");
    expect(normalizeResult("STATUS_LOGON_FAILURE")).toBe("FAILURE");
  });
});

describe("ingestCsv — result derivation and nullable logonType", () => {
  it("derives result from eventType when result column is empty", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-03-15T10:00:00Z,alice,10.0.0.1,DC01,4624,,3
2024-03-15T10:01:00Z,bob,10.0.0.2,DC01,4625,,3`;
    const { events, report } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(2);
    expect(report.validRows).toBe(2);
    expect(events[0].result).toBe("SUCCESS");
    expect(events[1].result).toBe("FAILURE");
  });

  it("normalises Audit Success / Failure and status codes in CSV", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-03-15T10:00:00Z,alice,10.0.0.1,DC01,4624,Audit Success,3
2024-03-15T10:01:00Z,bob,10.0.0.2,DC01,4625,Audit Failure,3
2024-03-15T10:02:00Z,carol,10.0.0.3,DC01,4624,0x0,3
2024-03-15T10:03:00Z,dave,10.0.0.4,DC01,4625,0xC000006A,3`;
    const { events } = ingestCsv(csv, BASE_CONFIG);
    expect(events[0].result).toBe("SUCCESS");
    expect(events[1].result).toBe("FAILURE");
    expect(events[2].result).toBe("SUCCESS");
    expect(events[3].result).toBe("FAILURE");
  });

  it("leaves logonType as null when missing without rejecting row", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-03-15T10:00:00Z,alice,10.0.0.1,DC01,4624,SUCCESS,`;
    const { events, report } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(1);
    expect(report.validRows).toBe(1);
    expect(report.invalidRows).toHaveLength(0);
    expect(events[0].logonType).toBeNull();
    expect(report.missingFieldCounts["logonType"]).toBe(1);
  });
});

