import { describe, expect, it } from "vitest";
import { buildRecallQuery } from "../../.agents/hooks/core/state-boundary.ts";
import type { OmaEvent } from "../../.agents/hooks/core/state-emit.ts";

function event(kind: string, payload: Record<string, unknown>): OmaEvent {
  return {
    eventId: `evt-${kind}`,
    ts: "2026-06-07T00:00:00.000Z",
    sid: "oma-test",
    kind,
    writerPid: 1,
    payload,
  };
}

describe("buildRecallQuery", () => {
  it("leads with the user prompt and supplements with project + decisions", () => {
    const query = buildRecallQuery(
      "/home/u/my-project",
      [event("decision.made", { subject: "auth.jwt", decision: "use RS256" })],
      "How does the token refresh flow work?",
    );

    expect(query.startsWith("How does the token refresh flow work?")).toBe(
      true,
    );
    expect(query).toContain("my-project");
    expect(query).toContain("auth.jwt");
  });

  it("falls back to project + recent decisions when no prompt is given", () => {
    const query = buildRecallQuery("/home/u/my-project", [
      event("decision.made", { subject: "db.engine", decision: "pick pg" }),
    ]);

    expect(query).toBe("my-project db.engine pick pg");
  });

  it("caps an oversized prompt so the query stays a focused signal", () => {
    const huge = "x".repeat(5000);
    const query = buildRecallQuery("/home/u/p", [], huge);

    expect(query.length).toBeLessThanOrEqual(400);
  });

  it("still returns the project scope when prompt and events are empty", () => {
    expect(buildRecallQuery("/home/u/my-project", [], "")).toBe("my-project");
  });
});
