/**
 * Tests for src/engine/baseline.ts — baseline learning.
 * Owner: Person A
 */
import { describe, it, expect } from "vitest";
import { learnBaselines, getBaseline } from "@/engine/baseline";
import type { LogEvent, Config } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    id: "test-id",
    timestamp: "2024-01-15T09:30:00Z",
    username: "alice",
    sourceIp: "192.168.1.10",
    host: "WS-001",
    eventType: "4624",
    result: "SUCCESS",
    logonType: "3",
    rawRow: "raw",
    flags: [],
    ...overrides,
  };
}

const TRAIN_CONFIG: Config = {
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("learnBaselines — basic learning", () => {
  it("creates an entry for every user seen in any event", () => {
    const events = [
      makeEvent({ username: "alice", timestamp: "2024-01-15T09:00:00Z" }),
      makeEvent({ username: "bob",   timestamp: "2024-02-15T09:00:00Z" }), // outside training
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    expect(map.has("alice")).toBe(true);
    expect(map.has("bob")).toBe(true);
  });

  it("learns the login-hour distribution (UTC) for events inside training window", () => {
    const events = [
      makeEvent({ username: "alice", timestamp: "2024-01-10T09:00:00Z" }), // hour 9
      makeEvent({ username: "alice", timestamp: "2024-01-11T14:00:00Z" }), // hour 14
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    const b = map.get("alice")!;
    expect(b.knownHours.has(9)).toBe(true);
    expect(b.knownHours.has(14)).toBe(true);
    expect(b.noBaseline).toBe(false);
  });

  it("learns known source IPs from training events", () => {
    const events = [
      makeEvent({ username: "alice", timestamp: "2024-01-10T09:00:00Z", sourceIp: "10.0.0.1" }),
      makeEvent({ username: "alice", timestamp: "2024-01-11T10:00:00Z", sourceIp: "10.0.0.2" }),
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    const b = map.get("alice")!;
    expect(b.knownSourceIps.has("10.0.0.1")).toBe(true);
    expect(b.knownSourceIps.has("10.0.0.2")).toBe(true);
  });

  it("learns known hosts from training events", () => {
    const events = [
      makeEvent({ username: "alice", timestamp: "2024-01-10T09:00:00Z", host: "WS-001" }),
      makeEvent({ username: "alice", timestamp: "2024-01-11T10:00:00Z", host: "WS-002" }),
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    const b = map.get("alice")!;
    expect(b.knownHosts.has("WS-001")).toBe(true);
    expect(b.knownHosts.has("WS-002")).toBe(true);
  });

  it("counts only training-period events in trainingEventCount", () => {
    const events = [
      makeEvent({ username: "alice", timestamp: "2024-01-10T09:00:00Z" }), // in
      makeEvent({ username: "alice", timestamp: "2024-01-20T09:00:00Z" }), // in
      makeEvent({ username: "alice", timestamp: "2024-02-05T09:00:00Z" }), // out
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    expect(map.get("alice")!.trainingEventCount).toBe(2);
  });
});

describe("learnBaselines — strict training window enforcement", () => {
  it("does NOT learn from events before the training period start", () => {
    const events = [
      makeEvent({ username: "alice", timestamp: "2023-12-31T23:59:59Z", sourceIp: "1.2.3.4" }),
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    const b = map.get("alice")!;
    expect(b.knownSourceIps.has("1.2.3.4")).toBe(false);
    expect(b.trainingEventCount).toBe(0);
    expect(b.noBaseline).toBe(true);
  });

  it("does NOT learn from events after the training period end", () => {
    const events = [
      makeEvent({ username: "alice", timestamp: "2024-02-01T00:00:01Z", host: "EVIL-HOST" }),
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    const b = map.get("alice")!;
    expect(b.knownHosts.has("EVIL-HOST")).toBe(false);
    expect(b.noBaseline).toBe(true);
  });

  it("only learns from the exact boundary events that are inside the window", () => {
    const events = [
      // exactly at start — inside
      makeEvent({ username: "alice", timestamp: "2024-01-01T00:00:00Z", sourceIp: "10.0.0.1" }),
      // exactly at end — inside
      makeEvent({ username: "alice", timestamp: "2024-01-31T23:59:59Z", sourceIp: "10.0.0.2" }),
      // 1ms after end — outside
      makeEvent({ username: "alice", timestamp: "2024-02-01T00:00:00Z", sourceIp: "10.0.0.3" }),
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    const b = map.get("alice")!;
    expect(b.knownSourceIps.has("10.0.0.1")).toBe(true);
    expect(b.knownSourceIps.has("10.0.0.2")).toBe(true);
    expect(b.knownSourceIps.has("10.0.0.3")).toBe(false);
    expect(b.trainingEventCount).toBe(2);
  });

  it("detections events do not pollute baselines", () => {
    // A user who first appears in the detection window has noBaseline = true
    const events = [
      makeEvent({ username: "newuser", timestamp: "2024-02-15T09:00:00Z", sourceIp: "5.5.5.5" }),
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    const b = map.get("newuser")!;
    expect(b.noBaseline).toBe(true);
    expect(b.knownSourceIps.size).toBe(0);
  });
});

describe("learnBaselines — no baseline sentinel", () => {
  it("marks users with no training events as noBaseline=true", () => {
    const events = [
      makeEvent({ username: "ghost", timestamp: "2024-03-01T09:00:00Z" }), // outside
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    expect(map.get("ghost")!.noBaseline).toBe(true);
  });

  it("marks users with training events as noBaseline=false", () => {
    const events = [
      makeEvent({ username: "known", timestamp: "2024-01-15T09:00:00Z" }),
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    expect(map.get("known")!.noBaseline).toBe(false);
  });
});

describe("getBaseline", () => {
  it("returns the stored baseline for a known user", () => {
    const events = [
      makeEvent({ username: "alice", timestamp: "2024-01-15T09:00:00Z" }),
    ];
    const map = learnBaselines(events, TRAIN_CONFIG);
    const b = getBaseline(map, "alice");
    expect(b.username).toBe("alice");
    expect(b.noBaseline).toBe(false);
  });

  it("returns a noBaseline sentinel for an unseen user", () => {
    const map = learnBaselines([], TRAIN_CONFIG);
    const b = getBaseline(map, "phantom");
    expect(b.username).toBe("phantom");
    expect(b.noBaseline).toBe(true);
    expect(b.knownHours.size).toBe(0);
  });
});
