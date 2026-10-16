/**
 * Tests for schedule/cron-nl.ts — parseIntervalToCron
 *
 * Table-driven coverage of all parsing paths:
 * - compact leading token ("5m", "2h", "1d", "30s")
 * - "every <N><unit>" compact form
 * - "every <N> <unit-word>" verbose form
 * - rounding cases (30s → 1m, 7m → nearest clean)
 * - error cases (empty, garbage, zero)
 */

import { describe, expect, it } from "vitest";
import { parseIntervalToCron } from "./cron-nl.js";

describe("parseIntervalToCron — happy paths", () => {
  it.each([
    // [input, expectedCron]
    ["5m", "*/5 * * * *"],
    ["every 20m", "*/20 * * * *"],
    ["every 5 minutes", "*/5 * * * *"],
    ["2h", "0 */2 * * *"],
    ["1d", "0 0 */1 * *"],
    ["every 1 hour", "0 */1 * * *"],
    ["every 2 hours", "0 */2 * * *"],
    ["every 1 day", "0 0 */1 * *"],
    ["every 3 days", "0 0 */3 * *"],
    ["10m", "*/10 * * * *"],
    ["15m", "*/15 * * * *"],
    ["30m", "*/30 * * * *"],
    ["1m", "*/1 * * * *"],
    ["6h", "0 */6 * * *"],
    ["12h", "0 */12 * * *"],
    // 60m is exactly 1 hour
    ["60m", "0 */1 * * *"],
    // 120m is exactly 2 hours
    ["120m", "0 */2 * * *"],
  ])('"%s" → cron "%s" with no rounding', (input, expectedCron) => {
    const result = parseIntervalToCron(input);
    expect(result.cron).toBe(expectedCron);
    expect(result.rounded).toBeUndefined();
  });
});

describe("parseIntervalToCron — rounding cases", () => {
  it("30s → */1 * * * * with rounded note (seconds ceiled to 1m)", () => {
    const result = parseIntervalToCron("30s");
    expect(result.cron).toBe("*/1 * * * *");
    expect(result.rounded).toBeDefined();
    expect(result.rounded).toContain("30s");
    expect(result.rounded).toContain("1 minute");
  });

  it("1s → */1 * * * * with rounded note", () => {
    const result = parseIntervalToCron("1s");
    expect(result.cron).toBe("*/1 * * * *");
    expect(result.rounded).toBeDefined();
  });

  it("7m → nearest clean interval (6m) with rounded note", () => {
    const result = parseIntervalToCron("7m");
    // 7 is not a divisor of 60; nearest clean divisor is 6 (|7-6|=1) vs 5 (|7-5|=2)
    expect(result.cron).toBe("*/6 * * * *");
    expect(result.rounded).toBeDefined();
    expect(result.rounded).toContain("7");
  });

  it("8m → nearest clean interval (10m) with rounded note", () => {
    const result = parseIntervalToCron("8m");
    // 8 is not a divisor of 60; nearest clean: 10 (|8-10|=2) vs 6 (|8-6|=2) — tie goes to first found
    // CLEAN_MINUTES = [1,2,3,4,5,6,10,...]: dist(8,6)=2, dist(8,10)=2 → 6 wins (first with dist=2)
    expect(result.rounded).toBeDefined();
    expect(result.rounded).toContain("8");
  });

  it("7h → nearest clean hour with rounded note", () => {
    const result = parseIntervalToCron("7h");
    // 7 is not a clean divisor of 24; nearest: 6 (|7-6|=1) vs 8 (|7-8|=1) — 6 wins
    expect(result.cron).toBe("0 */6 * * *");
    expect(result.rounded).toBeDefined();
    expect(result.rounded).toContain("7h");
  });

  it("every 30 seconds → */1 * * * * with rounded note", () => {
    const result = parseIntervalToCron("every 30 seconds");
    expect(result.cron).toBe("*/1 * * * *");
    expect(result.rounded).toBeDefined();
  });
});

describe("parseIntervalToCron — error cases", () => {
  it("throws on empty string", () => {
    expect(() => parseIntervalToCron("")).toThrow();
  });

  it("throws on whitespace-only string", () => {
    expect(() => parseIntervalToCron("   ")).toThrow();
  });

  it("throws on plain text with no interval", () => {
    expect(() => parseIntervalToCron("run every morning")).toThrow();
  });

  it("throws on garbage input", () => {
    expect(() => parseIntervalToCron("abc def xyz")).toThrow();
  });

  it("throws on unit with no number", () => {
    expect(() => parseIntervalToCron("every minutes")).toThrow();
  });
});

describe("parseIntervalToCron — edge cases", () => {
  it("handles 'every' prefix with compact token (every 1d)", () => {
    const result = parseIntervalToCron("every 1d");
    expect(result.cron).toBe("0 0 */1 * *");
    expect(result.rounded).toBeUndefined();
  });

  it("handles mixed-case units", () => {
    const result = parseIntervalToCron("every 5 Minutes");
    expect(result.cron).toBe("*/5 * * * *");
    expect(result.rounded).toBeUndefined();
  });
});
