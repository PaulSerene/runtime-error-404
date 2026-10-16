import { describe, it, expect } from "vitest";
import {
  normalizeUsername,
  normalizeIp,
  stripDomain,
  isMachineAccount,
} from "@/engine/ingest/normalize";
import { ingestCsv } from "@/engine/ingest";
import type { Config } from "@/types";

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

describe("normalizeUsername", () => {
  it("lowercases usernames", () => {
    expect(normalizeUsername("Alice")).toBe("alice");
    expect(normalizeUsername("ADMINISTRATOR")).toBe("administrator");
  });

  it("strips Windows NetBIOS DOMAIN\\ prefix", () => {
    expect(normalizeUsername("CORP\\alice")).toBe("alice");
    expect(normalizeUsername("DOMAIN.LOCAL\\Bob")).toBe("bob");
    expect(normalizeUsername("SUB\\CORP\\charlie")).toBe("charlie");
  });

  it("strips @domain suffix", () => {
    expect(normalizeUsername("alice@corp.local")).toBe("alice");
    expect(normalizeUsername("Bob@company.com")).toBe("bob");
  });

  it("handles both DOMAIN\\ and @domain", () => {
    expect(normalizeUsername("CORP\\alice@corp.local")).toBe("alice");
  });

  it("skips machine accounts ending in $ (returns null)", () => {
    expect(normalizeUsername("DC01$")).toBeNull();
    expect(normalizeUsername("CORP\\WORKSTATION01$")).toBeNull();
    expect(normalizeUsername("laptop$@domain.com")).toBeNull();
    expect(isMachineAccount("DC01$")).toBe(true);
    expect(isMachineAccount("CORP\\WS-01$")).toBe(true);
    expect(isMachineAccount("alice")).toBe(false);
  });

  it("skips - and empty placeholders (returns null)", () => {
    expect(normalizeUsername("-")).toBeNull();
    expect(normalizeUsername("")).toBeNull();
    expect(normalizeUsername("   ")).toBeNull();
    expect(normalizeUsername(null)).toBeNull();
    expect(normalizeUsername(undefined)).toBeNull();
    expect(normalizeUsername("N/A")).toBeNull();
    expect(normalizeUsername("(null)")).toBeNull();
  });
});

describe("normalizeIp", () => {
  it("trims whitespace from IPs", () => {
    expect(normalizeIp("  192.168.1.10  ")).toBe("192.168.1.10");
  });

  it("treats ::1, 127.0.0.1 and - as null", () => {
    expect(normalizeIp("127.0.0.1")).toBeNull();
    expect(normalizeIp("::1")).toBeNull();
    expect(normalizeIp("[::1]")).toBeNull();
    expect(normalizeIp("-")).toBeNull();
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp("   ")).toBeNull();
    expect(normalizeIp(null)).toBeNull();
    expect(normalizeIp("0.0.0.0")).toBeNull();
    expect(normalizeIp("::")).toBeNull();
  });

  it("handles IPv4-mapped IPv6 ::ffff: prefix", () => {
    expect(normalizeIp("::ffff:192.168.1.50")).toBe("192.168.1.50");
    expect(normalizeIp("::FFFF:10.0.0.1")).toBe("10.0.0.1");
    expect(normalizeIp("[::ffff:172.16.0.5]")).toBe("172.16.0.5");
    // ::ffff: mapped to loopback returns null
    expect(normalizeIp("::ffff:127.0.0.1")).toBeNull();
  });

  it("handles general IPv6 addresses", () => {
    expect(normalizeIp("2001:0db8:85a3::8a2e:0370:7334")).toBe("2001:0db8:85a3::8a2e:0370:7334");
    expect(normalizeIp("FE80::1FF:FE23:4567:890A")).toBe("fe80::1ff:fe23:4567:890a");
  });
});

describe("ingestCsv with normalize integration", () => {
  it("normalises usernames and IPs during CSV ingestion", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-03-15T10:00:00Z,CORP\\Alice,::ffff:192.168.1.20,DC01,4624,SUCCESS,3
2024-03-15T10:01:00Z,Bob@corp.local,127.0.0.1,DC01,4624,SUCCESS,3`;

    const { events } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(2);
    expect(events[0].username).toBe("alice");
    expect(events[0].sourceIp).toBe("192.168.1.20");
    expect(events[1].username).toBe("bob");
    expect(events[1].sourceIp).toBe(""); // 127.0.0.1 normalized to empty string
  });

  it("skips machine accounts ending in $ during CSV ingestion", () => {
    const csv = `timestamp,username,sourceip,host,eventtype,result,logontype
2024-03-15T10:00:00Z,CORP\\DC01$,10.0.0.1,DC01,4624,SUCCESS,3
2024-03-15T10:01:00Z,alice,10.0.0.2,DC01,4624,SUCCESS,3`;

    const { events } = ingestCsv(csv, BASE_CONFIG);
    expect(events).toHaveLength(1);
    expect(events[0].username).toBe("alice");
  });
});
