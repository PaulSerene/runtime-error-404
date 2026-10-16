/**
 * Unit tests for each detection rule using hand-crafted minimal event arrays.
 * Owner: Person A
 */
import { describe, it, expect } from "vitest";
import type { LogEvent, Config } from "@/types";
import type { BaselineMap } from "@/engine/baseline";
import { learnBaselines } from "@/engine/baseline";
import { repeatedFailures } from "@/engine/rules/repeatedFailures";
import { burstThenSuccess } from "@/engine/rules/burstThenSuccess";
import { passwordSpray }    from "@/engine/rules/passwordSpray";
import { unusualHour }      from "@/engine/rules/unusualHour";
import { newIpOrLocation }  from "@/engine/rules/newIpOrLocation";
import { newHostAccess }    from "@/engine/rules/newHostAccess";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    id: Math.random().toString(36).slice(2),
    timestamp: "2024-02-15T10:00:00Z",
    username: "testuser",
    sourceIp: "192.168.1.10",
    host: "WS-001",
    eventType: "4625",
    result: "FAILURE",
    logonType: "3",
    rawRow: "raw",
    flags: [],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    thresholds: {},
    trainingPeriod: { start: "2024-01-01T00:00:00Z", end: "2024-01-31T23:59:59Z" },
    timezone: "UTC",
    maintenanceWindows: [],
    approvedAccounts: [],
    vpnCidrs: [],
    assets: [],
    privilegedAccounts: [],
    ipLocations: [],
    ...overrides,
  };
}

/** Returns an empty baseline map with optional pre-seeded entries */
function makeBaselines(
  entries: Array<{ username: string; hours?: number[]; ips?: string[]; hosts?: string[]; count?: number }> = [],
): BaselineMap {
  const map: BaselineMap = new Map();
  for (const e of entries) {
    map.set(e.username, {
      username: e.username,
      knownHours: new Set(e.hours ?? []),
      knownSourceIps: new Set(e.ips ?? []),
      knownHosts: new Set(e.hosts ?? []),
      trainingEventCount: e.count ?? (e.hours?.length ?? 0) + (e.ips?.length ?? 0),
      noBaseline: (e.count ?? 1) === 0,
    });
  }
  return map;
}

// Training window ends 2024-01-31; detection starts 2024-02-01
const DET_TS = "2024-02-15T10:00:00Z"; // clearly in detection period

// ─── repeatedFailures ─────────────────────────────────────────────────────────

describe("repeatedFailures", () => {
  const cfg = makeConfig({ thresholds: { failureCount: 5, failureWindowMinutes: 10 } });
  const baselines = makeBaselines();

  it("fires when ≥ failureCount failures occur within the window", () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      makeEvent({
        timestamp: new Date(new Date(DET_TS).getTime() + i * 60000).toISOString(),
        result: "FAILURE",
      }),
    );
    const alerts = repeatedFailures(events, baselines, cfg, [], []);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].ruleId).toBe("RULE-BRUTE-FORCE");
    expect(alerts[0].severity).toBe("high");
  });

  it("does NOT fire when count is below threshold", () => {
    const events = Array.from({ length: 4 }, (_, i) =>
      makeEvent({
        timestamp: new Date(new Date(DET_TS).getTime() + i * 60000).toISOString(),
        result: "FAILURE",
      }),
    );
    expect(repeatedFailures(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("does NOT fire for events in the training period", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({
        timestamp: new Date(new Date("2024-01-15T10:00:00Z").getTime() + i * 60000).toISOString(),
        result: "FAILURE",
      }),
    );
    expect(repeatedFailures(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("suppresses events from approved accounts", () => {
    const cfg2 = makeConfig({ thresholds: { failureCount: 5 }, approvedAccounts: ["testuser"] });
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ timestamp: new Date(new Date(DET_TS).getTime() + i * 10000).toISOString(), result: "FAILURE" }),
    );
    expect(repeatedFailures(events, baselines, cfg2, [], [])).toHaveLength(0);
  });

  it("suppresses events from VPN IPs", () => {
    const cfg2 = makeConfig({ thresholds: { failureCount: 5 }, vpnCidrs: ["192.168.1.0/24"] });
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ timestamp: new Date(new Date(DET_TS).getTime() + i * 10000).toISOString(), result: "FAILURE" }),
    );
    expect(repeatedFailures(events, baselines, cfg2, [], [])).toHaveLength(0);
  });

  it("suppresses events in maintenance windows", () => {
    const cfg2 = makeConfig({
      thresholds: { failureCount: 5 },
      maintenanceWindows: [{ start: "2024-02-15T09:00:00Z", end: "2024-02-15T11:00:00Z" }],
    });
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ timestamp: new Date(new Date(DET_TS).getTime() + i * 10000).toISOString(), result: "FAILURE" }),
    );
    expect(repeatedFailures(events, baselines, cfg2, [], [])).toHaveLength(0);
  });

  it("explanation contains 'suspicious indications'", () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      makeEvent({ timestamp: new Date(new Date(DET_TS).getTime() + i * 10000).toISOString(), result: "FAILURE" }),
    );
    const alerts = repeatedFailures(events, baselines, cfg, [], []);
    expect(alerts[0]?.explanation.toLowerCase()).toContain("suspicious indications");
  });
});

// ─── burstThenSuccess ─────────────────────────────────────────────────────────

describe("burstThenSuccess", () => {
  const cfg = makeConfig({ thresholds: { burstFailures: 3, burstWindowMinutes: 15 } });
  const baselines = makeBaselines();

  it("fires when ≥ burstFailures failures precede a success within the window", () => {
    const base = new Date(DET_TS).getTime();
    const events = [
      makeEvent({ timestamp: new Date(base).toISOString(),           result: "FAILURE" }),
      makeEvent({ timestamp: new Date(base + 60000).toISOString(),   result: "FAILURE" }),
      makeEvent({ timestamp: new Date(base + 120000).toISOString(),  result: "FAILURE" }),
      makeEvent({ timestamp: new Date(base + 180000).toISOString(),  result: "SUCCESS", eventType: "4624" }),
    ];
    const alerts = burstThenSuccess(events, baselines, cfg, [], []);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].ruleId).toBe("RULE-FAILURE-THEN-SUCCESS");
    expect(alerts[0].severity).toBe("critical");
  });

  it("does NOT fire when failures are below threshold", () => {
    const base = new Date(DET_TS).getTime();
    const events = [
      makeEvent({ timestamp: new Date(base).toISOString(),           result: "FAILURE" }),
      makeEvent({ timestamp: new Date(base + 60000).toISOString(),   result: "FAILURE" }),
      makeEvent({ timestamp: new Date(base + 120000).toISOString(),  result: "SUCCESS", eventType: "4624" }),
    ];
    expect(burstThenSuccess(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("does NOT fire when success comes from different IP", () => {
    const base = new Date(DET_TS).getTime();
    const events = [
      makeEvent({ timestamp: new Date(base).toISOString(),           result: "FAILURE", sourceIp: "10.0.0.1" }),
      makeEvent({ timestamp: new Date(base + 60000).toISOString(),   result: "FAILURE", sourceIp: "10.0.0.1" }),
      makeEvent({ timestamp: new Date(base + 120000).toISOString(),  result: "FAILURE", sourceIp: "10.0.0.1" }),
      makeEvent({ timestamp: new Date(base + 180000).toISOString(),  result: "SUCCESS", sourceIp: "10.0.0.2", eventType: "4624" }),
    ];
    expect(burstThenSuccess(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("explanation contains 'suspicious indications'", () => {
    const base = new Date(DET_TS).getTime();
    const events = [
      makeEvent({ timestamp: new Date(base).toISOString(),          result: "FAILURE" }),
      makeEvent({ timestamp: new Date(base + 30000).toISOString(),  result: "FAILURE" }),
      makeEvent({ timestamp: new Date(base + 60000).toISOString(),  result: "FAILURE" }),
      makeEvent({ timestamp: new Date(base + 90000).toISOString(),  result: "SUCCESS", eventType: "4624" }),
    ];
    const alerts = burstThenSuccess(events, baselines, cfg, [], []);
    expect(alerts[0]?.explanation.toLowerCase()).toContain("suspicious indications");
  });
});

// ─── passwordSpray ────────────────────────────────────────────────────────────

describe("passwordSpray", () => {
  const cfg = makeConfig({ thresholds: { sprayAccounts: 5, sprayWindowMinutes: 10 } });
  const baselines = makeBaselines();
  const attackIp = "10.5.5.5";

  it("fires when one IP hits ≥ sprayAccounts distinct accounts with failures", () => {
    const base = new Date(DET_TS).getTime();
    const events = ["alice", "bob", "carol", "dave", "eve"].map((u, i) =>
      makeEvent({
        username: u,
        sourceIp: attackIp,
        timestamp: new Date(base + i * 5000).toISOString(),
        result: "FAILURE",
      }),
    );
    const alerts = passwordSpray(events, baselines, cfg, [], []);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].ruleId).toBe("RULE-PASSWORD-SPRAY");
    expect(alerts[0].severity).toBe("critical");
    const targeted = alerts[0].details["targetedAccounts"] as string[];
    expect(targeted).toContain("alice");
  });

  it("does NOT fire when fewer accounts are targeted", () => {
    const base = new Date(DET_TS).getTime();
    const events = ["alice", "bob", "carol"].map((u, i) =>
      makeEvent({
        username: u,
        sourceIp: attackIp,
        timestamp: new Date(base + i * 5000).toISOString(),
        result: "FAILURE",
      }),
    );
    expect(passwordSpray(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("does NOT fire on success events", () => {
    const base = new Date(DET_TS).getTime();
    const events = ["alice", "bob", "carol", "dave", "eve"].map((u, i) =>
      makeEvent({
        username: u,
        sourceIp: attackIp,
        timestamp: new Date(base + i * 5000).toISOString(),
        result: "SUCCESS",
        eventType: "4624",
      }),
    );
    expect(passwordSpray(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("explanation contains 'suspicious indications'", () => {
    const base = new Date(DET_TS).getTime();
    const events = ["alice", "bob", "carol", "dave", "eve"].map((u, i) =>
      makeEvent({ username: u, sourceIp: attackIp, timestamp: new Date(base + i * 5000).toISOString(), result: "FAILURE" }),
    );
    const alerts = passwordSpray(events, baselines, cfg, [], []);
    expect(alerts[0]?.explanation.toLowerCase()).toContain("suspicious indications");
  });
});

// ─── unusualHour ─────────────────────────────────────────────────────────────

describe("unusualHour", () => {
  const cfg = makeConfig({ thresholds: { minBaselineLogins: 10 } });

  it("fires when login hour is outside baseline hours", () => {
    // Baseline knows hours 9–17 with 15 events
    const baselines = makeBaselines([{
      username: "testuser",
      hours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
      ips: ["192.168.1.10"],
      hosts: ["WS-001"],
      count: 15,
    }]);
    // Login at 03:00 UTC — outside baseline
    const events = [makeEvent({
      timestamp: "2024-02-15T03:00:00Z",
      result: "SUCCESS",
      eventType: "4624",
    })];
    const alerts = unusualHour(events, baselines, cfg, [], []);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].ruleId).toBe("RULE-OFF-HOURS");
    expect(alerts[0].severity).toBe("medium");
  });

  it("does NOT fire when login hour is within baseline", () => {
    const baselines = makeBaselines([{
      username: "testuser",
      hours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
      count: 15,
    }]);
    const events = [makeEvent({
      timestamp: "2024-02-15T10:00:00Z",
      result: "SUCCESS",
      eventType: "4624",
    })];
    expect(unusualHour(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("does NOT fire when minBaselineLogins threshold is not met", () => {
    const baselines = makeBaselines([{
      username: "testuser",
      hours: [3], // knows hour 3, but only 5 training events
      count: 5,
    }]);
    const events = [makeEvent({
      timestamp: "2024-02-15T03:00:00Z",
      result: "SUCCESS",
    })];
    expect(unusualHour(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("does NOT fire when user has noBaseline", () => {
    const baselines = makeBaselines([{ username: "testuser", count: 0 }]);
    const events = [makeEvent({ timestamp: "2024-02-15T03:00:00Z", result: "SUCCESS" })];
    expect(unusualHour(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("only fires on SUCCESS events", () => {
    const baselines = makeBaselines([{ username: "testuser", hours: [9, 10, 11], count: 15 }]);
    const events = [makeEvent({ timestamp: "2024-02-15T03:00:00Z", result: "FAILURE" })];
    expect(unusualHour(events, baselines, cfg, [], [])).toHaveLength(0);
  });
});

// ─── newIpOrLocation ─────────────────────────────────────────────────────────

describe("newIpOrLocation", () => {
  const cfg = makeConfig({
    ipLocations: [
      { cidr: "192.168.0.0/16", location: "HQ LAN" },
      { cidr: "10.0.0.0/8",     location: "Internal" },
    ],
  });

  it("fires when IP and location are both new", () => {
    const baselines = makeBaselines([{
      username: "testuser",
      ips: ["192.168.1.10"],   // known IP in HQ LAN
      count: 15,
    }]);
    // New IP from unknown external location
    const events = [makeEvent({
      timestamp: DET_TS,
      sourceIp: "203.0.113.99",  // not in any known range
      result: "SUCCESS",
      eventType: "4624",
    })];
    const alerts = newIpOrLocation(events, baselines, cfg, cfg.ipLocations, []);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].ruleId).toBe("RULE-NEW-SOURCE-IP");
    expect(alerts[0].severity).toBe("medium");
  });

  it("does NOT fire when IP is already in baseline", () => {
    const baselines = makeBaselines([{
      username: "testuser",
      ips: ["192.168.1.10"],
      count: 15,
    }]);
    const events = [makeEvent({
      timestamp: DET_TS,
      sourceIp: "192.168.1.10",
      result: "SUCCESS",
    })];
    expect(newIpOrLocation(events, baselines, cfg, cfg.ipLocations, [])).toHaveLength(0);
  });

  it("does NOT fire when user has noBaseline", () => {
    const baselines = makeBaselines([{ username: "testuser", count: 0 }]);
    const events = [makeEvent({ timestamp: DET_TS, sourceIp: "203.0.113.1", result: "SUCCESS" })];
    expect(newIpOrLocation(events, baselines, cfg, cfg.ipLocations, [])).toHaveLength(0);
  });

  it("does NOT fire on failure events", () => {
    const baselines = makeBaselines([{ username: "testuser", ips: ["10.0.0.1"], count: 15 }]);
    const events = [makeEvent({ timestamp: DET_TS, sourceIp: "203.0.113.1", result: "FAILURE" })];
    expect(newIpOrLocation(events, baselines, cfg, cfg.ipLocations, [])).toHaveLength(0);
  });

  it("explanation contains 'suspicious indications'", () => {
    const baselines = makeBaselines([{ username: "testuser", ips: ["192.168.1.10"], count: 15 }]);
    const events = [makeEvent({ timestamp: DET_TS, sourceIp: "5.5.5.5", result: "SUCCESS" })];
    const alerts = newIpOrLocation(events, baselines, cfg, cfg.ipLocations, []);
    expect(alerts[0]?.explanation.toLowerCase()).toContain("suspicious indications");
  });
});

// ─── newHostAccess ────────────────────────────────────────────────────────────

describe("newHostAccess", () => {
  const cfg = makeConfig({ thresholds: { newHostCount: 3, newHostWindowHours: 24 } });

  it("fires when user accesses ≥ newHostCount new hosts within the window", () => {
    const baselines = makeBaselines([{
      username: "testuser",
      hosts: ["WS-001"],
      count: 15,
    }]);
    const base = new Date(DET_TS).getTime();
    const events = ["WS-002", "WS-003", "WS-004"].map((host, i) =>
      makeEvent({
        host,
        timestamp: new Date(base + i * 60000).toISOString(),
        result: "SUCCESS",
      }),
    );
    const alerts = newHostAccess(events, baselines, cfg, [], []);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].ruleId).toBe("RULE-LATERAL-MOVEMENT");
    expect(alerts[0].severity).toBe("high");
  });

  it("does NOT fire when fewer new hosts are accessed", () => {
    const baselines = makeBaselines([{ username: "testuser", hosts: ["WS-001"], count: 15 }]);
    const base = new Date(DET_TS).getTime();
    const events = ["WS-002", "WS-003"].map((host, i) =>
      makeEvent({ host, timestamp: new Date(base + i * 60000).toISOString() }),
    );
    expect(newHostAccess(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("does NOT fire when hosts are already in baseline", () => {
    const baselines = makeBaselines([{
      username: "testuser",
      hosts: ["WS-001", "WS-002", "WS-003", "WS-004"],
      count: 15,
    }]);
    const base = new Date(DET_TS).getTime();
    const events = ["WS-002", "WS-003", "WS-004"].map((host, i) =>
      makeEvent({ host, timestamp: new Date(base + i * 60000).toISOString() }),
    );
    expect(newHostAccess(events, baselines, cfg, [], [])).toHaveLength(0);
  });

  it("explanation contains 'suspicious indications'", () => {
    const baselines = makeBaselines([{ username: "testuser", hosts: ["WS-001"], count: 15 }]);
    const base = new Date(DET_TS).getTime();
    const events = ["WS-002", "WS-003", "WS-004"].map((host, i) =>
      makeEvent({ host, timestamp: new Date(base + i * 60000).toISOString() }),
    );
    const alerts = newHostAccess(events, baselines, cfg, [], []);
    expect(alerts[0]?.explanation.toLowerCase()).toContain("suspicious indications");
  });
});
