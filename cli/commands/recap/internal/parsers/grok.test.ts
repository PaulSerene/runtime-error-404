/**
 * grok.test.ts — regression tests for the grok recap parser.
 *
 * Focused on the response-pairing fix: two prompts sharing an 80+ char prefix
 * must each receive their own assistant response, not each other's.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempHome = mkdtempSync(join(os.tmpdir(), "oma-grok-home-"));

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => tempHome };
});

const { getParsers } = await import("../registry.js");
await import("./grok.js");
const parser = getParsers().find((p) => p.name === "grok");

describe("grok parser", () => {
  const grokSessions = join(tempHome, ".grok", "sessions");

  beforeEach(() => {
    rmSync(join(tempHome, ".grok"), { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(join(tempHome, ".grok"), { recursive: true, force: true });
  });

  it("response pairing: two prompts sharing an 80+ char prefix each get their own response", async () => {
    const sharedPrefix = "B".repeat(80);
    const promptA = `${sharedPrefix} - question Gamma`;
    const promptB = `${sharedPrefix} - question Delta`;

    const ts = new Date("2026-05-29T12:00:00.000Z").getTime();
    const encodedWs = encodeURIComponent("/workspace/test-project");
    const wsDir = join(grokSessions, encodedWs);
    const sessionDir = join(wsDir, "session-xyz");

    mkdirSync(wsDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });

    // Write prompt_history.jsonl — source of entries in grok parser
    writeFileSync(
      join(wsDir, "prompt_history.jsonl"),
      [
        JSON.stringify({
          timestamp: new Date(ts).toISOString(),
          session_id: "session-xyz",
          prompt: promptA,
        }),
        JSON.stringify({
          timestamp: new Date(ts + 2000).toISOString(),
          session_id: "session-xyz",
          prompt: promptB,
        }),
      ].join("\n"),
      "utf-8",
    );

    // Write chat_history.jsonl — source of responses in grok parser
    writeFileSync(
      join(sessionDir, "chat_history.jsonl"),
      [
        JSON.stringify({
          role: "user",
          content: promptA,
          timestamp: new Date(ts).toISOString(),
        }),
        JSON.stringify({
          role: "assistant",
          content: "Response for Gamma",
          timestamp: new Date(ts + 1000).toISOString(),
        }),
        JSON.stringify({
          role: "user",
          content: promptB,
          timestamp: new Date(ts + 2000).toISOString(),
        }),
        JSON.stringify({
          role: "assistant",
          content: "Response for Delta",
          timestamp: new Date(ts + 3000).toISOString(),
        }),
      ].join("\n"),
      "utf-8",
    );

    const entries = await parser?.parse(ts - 10_000, ts + 10_000);
    expect(entries).toHaveLength(2);

    const entryA = entries?.find((e) => e.prompt === promptA);
    const entryB = entries?.find((e) => e.prompt === promptB);

    expect(entryA).toBeDefined();
    expect(entryB).toBeDefined();
    expect(entryA?.response).toContain("Gamma");
    expect(entryB?.response).toContain("Delta");
    // Cross-assignment must not happen
    expect(entryA?.response).not.toContain("Delta");
    expect(entryB?.response).not.toContain("Gamma");
  });
});
