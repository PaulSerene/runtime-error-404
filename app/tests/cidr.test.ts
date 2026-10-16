/**
 * Tests for CIDR matching utilities in src/engine/ingest.ts.
 * Owner: Person A
 */
import { describe, it, expect } from "vitest";
import {
  ipToInt,
  maskBitsToInt,
  parseCidr,
  ipInCidr,
  lookupLocation,
  parseIpLocationCsv,
} from "@/engine/ingest";

// ─── ipToInt ─────────────────────────────────────────────────────────────────

describe("ipToInt", () => {
  it("converts 0.0.0.0 to 0", () => {
    expect(ipToInt("0.0.0.0")).toBe(0);
  });

  it("converts 255.255.255.255 to 4294967295", () => {
    expect(ipToInt("255.255.255.255")).toBe(4294967295);
  });

  it("converts 192.168.1.1 correctly", () => {
    // 192*16777216 + 168*65536 + 1*256 + 1
    const expected = (192 << 24 | 168 << 16 | 1 << 8 | 1) >>> 0;
    expect(ipToInt("192.168.1.1")).toBe(expected);
  });

  it("returns null for non-IP strings", () => {
    expect(ipToInt("not-an-ip")).toBeNull();
    expect(ipToInt("300.1.1.1")).toBeNull();
    expect(ipToInt("1.2.3")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(ipToInt("")).toBeNull();
  });
});

// ─── maskBitsToInt ───────────────────────────────────────────────────────────

describe("maskBitsToInt", () => {
  it("returns all zeros for /0", () => {
    expect(maskBitsToInt(0)).toBe(0);
  });

  it("returns all ones for /32", () => {
    expect(maskBitsToInt(32)).toBe(4294967295);
  });

  it("returns correct mask for /24", () => {
    // 255.255.255.0
    expect(maskBitsToInt(24)).toBe((0xffffff00) >>> 0);
  });

  it("returns correct mask for /16", () => {
    expect(maskBitsToInt(16)).toBe((0xffff0000) >>> 0);
  });

  it("returns correct mask for /8", () => {
    expect(maskBitsToInt(8)).toBe((0xff000000) >>> 0);
  });
});

// ─── parseCidr ───────────────────────────────────────────────────────────────

describe("parseCidr", () => {
  it("parses a valid CIDR correctly", () => {
    const r = parseCidr("192.168.1.0/24");
    expect(r).not.toBeNull();
    expect(r!.maskBits).toBe(24);
  });

  it("returns null for invalid CIDR format", () => {
    expect(parseCidr("not-a-cidr")).toBeNull();
    expect(parseCidr("192.168.1.0/33")).toBeNull();
    expect(parseCidr("192.168.1.1")).toBeNull(); // no prefix
  });

  it("returns null for out-of-range IP octets", () => {
    expect(parseCidr("256.168.1.0/24")).toBeNull();
  });
});

// ─── ipInCidr ────────────────────────────────────────────────────────────────

describe("ipInCidr", () => {
  const makeEntry = (cidr: string) => {
    const parsed = parseCidr(cidr)!;
    return { cidr, location: "test", ...parsed };
  };

  it("correctly matches an IP inside a /24 network", () => {
    const entry = makeEntry("192.168.1.0/24");
    expect(ipInCidr("192.168.1.100", entry)).toBe(true);
    expect(ipInCidr("192.168.1.255", entry)).toBe(true);
    expect(ipInCidr("192.168.1.0",   entry)).toBe(true);
  });

  it("correctly rejects an IP outside a /24 network", () => {
    const entry = makeEntry("192.168.1.0/24");
    expect(ipInCidr("192.168.2.1", entry)).toBe(false);
    expect(ipInCidr("10.0.0.1",    entry)).toBe(false);
  });

  it("matches a /16 network", () => {
    const entry = makeEntry("10.100.0.0/16");
    expect(ipInCidr("10.100.5.22",  entry)).toBe(true);
    expect(ipInCidr("10.100.255.1", entry)).toBe(true);
    expect(ipInCidr("10.101.0.1",   entry)).toBe(false);
  });

  it("matches a /32 (single host)", () => {
    const entry = makeEntry("8.8.8.8/32");
    expect(ipInCidr("8.8.8.8", entry)).toBe(true);
    expect(ipInCidr("8.8.8.9", entry)).toBe(false);
  });

  it("matches a /0 (matches everything)", () => {
    const entry = makeEntry("0.0.0.0/0");
    expect(ipInCidr("1.2.3.4",       entry)).toBe(true);
    expect(ipInCidr("255.255.255.255", entry)).toBe(true);
  });

  it("returns false for an invalid IP string", () => {
    const entry = makeEntry("192.168.1.0/24");
    expect(ipInCidr("not-an-ip", entry)).toBe(false);
  });
});

// ─── lookupLocation ──────────────────────────────────────────────────────────

describe("lookupLocation", () => {
  const CSV = `cidr,location
192.168.0.0/16,HQ LAN
10.100.0.0/16,Corporate VPN
185.220.101.0/24,Tor Exit Node`;

  const entries = parseIpLocationCsv(CSV);

  it("returns the correct location for an IP in a known range", () => {
    expect(lookupLocation("192.168.1.100", entries)).toBe("HQ LAN");
    expect(lookupLocation("10.100.5.22",   entries)).toBe("Corporate VPN");
    expect(lookupLocation("185.220.101.47",entries)).toBe("Tor Exit Node");
  });

  it("returns null for an IP not in any range", () => {
    expect(lookupLocation("203.0.113.45", entries)).toBeNull();
    expect(lookupLocation("8.8.8.8",      entries)).toBeNull();
  });

  it("returns the first matching range when multiple could match", () => {
    // 10.100.5.22 matches Corporate VPN (10.100.0.0/16) and NOT HQ LAN
    expect(lookupLocation("10.100.5.22", entries)).toBe("Corporate VPN");
  });

  it("returns null for an invalid IP string", () => {
    expect(lookupLocation("not-an-ip", entries)).toBeNull();
  });

  it("returns null for empty entries list", () => {
    expect(lookupLocation("192.168.1.1", [])).toBeNull();
  });
});
