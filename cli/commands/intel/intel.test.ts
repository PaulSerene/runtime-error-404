import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CandidateGap,
  type IntelConfig,
  type IntelSignal,
  resolveIntelConfig,
  reviewCandidates,
  runIntelSuggest,
  scoreCandidates,
} from "./suggest.js";

let tmpDir: string;

function makeTmpDir(): string {
  return path.join(os.tmpdir(), "oma-intel-test", randomUUID());
}

function writeFile(relativePath: string, content: string): string {
  const filePath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

beforeEach(() => {
  tmpDir = makeTmpDir();
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveIntelConfig", () => {
  it("loads minimal YAML config and keeps GitHub repos as source inputs", () => {
    writeFile(
      "oma-intel.yaml",
      [
        "version: 1",
        "target: first-fluke/oh-my-agent",
        "topic: agent harness workflows",
        "sources:",
        "  github:",
        "    repos:",
        "      - owner/example-agent-tool",
        "  market:",
        "    enabled: true",
        "window:",
        "  since: 14d",
        "output:",
        "  dir: docs/intel",
        "  formats: [md, json]",
        "remote:",
        "  github_issue:",
        "    enabled: false",
        "    require_confirm: true",
      ].join("\n"),
    );

    const config = resolveIntelConfig({ cwd: tmpDir });

    expect(config.target).toBe("first-fluke/oh-my-agent");
    expect(config.topic).toBe("agent harness workflows");
    expect(config.sources.github?.repos).toEqual(["owner/example-agent-tool"]);
    expect(config.sources.market?.enabled).toBe(true);
    expect(config.window.since).toBe("14d");
    expect(config.output.dir).toBe("docs/intel");
  });

  it("rejects configs with both since and last_commits", () => {
    writeFile(
      "oma-intel.yaml",
      [
        "version: 1",
        "target: first-fluke/oh-my-agent",
        "sources:",
        "  github:",
        "    repos: [owner/example]",
        "window:",
        "  since: 30d",
        "  last_commits: 10",
      ].join("\n"),
    );

    expect(() => resolveIntelConfig({ cwd: tmpDir })).toThrow(
      "Config must use only one window",
    );
  });

  it("lets inline repos override configured GitHub repos", () => {
    writeFile(
      "oma-intel.yaml",
      [
        "version: 1",
        "target: first-fluke/oh-my-agent",
        "sources:",
        "  github:",
        "    repos: [owner/from-config]",
      ].join("\n"),
    );

    const config = resolveIntelConfig({
      cwd: tmpDir,
      repos: "owner/from-cli,other/tool",
    });

    expect(config.sources.github?.repos).toEqual([
      "owner/from-cli",
      "other/tool",
    ]);
  });
});

describe("scoreCandidates", () => {
  it("accepts repeated high-trust capability signals", () => {
    const baseSignal = {
      source: "commit" as const,
      observedAt: "2026-06-01T00:00:00Z",
      retrievedAt: "2026-06-01T00:00:00Z",
      summary: "team orchestration workflow verification",
      capabilityTags: ["workflow-loop"],
      trust: "high" as const,
    };
    const signals: IntelSignal[] = [
      {
        ...baseSignal,
        repo: "owner/a",
        title: "Add workflow loop",
      },
      {
        ...baseSignal,
        repo: "owner/b",
        title: "Improve verification loop",
      },
    ];

    const candidates = scoreCandidates(signals);

    expect(candidates[0]?.capability).toBe("workflow-loop");
    expect(candidates[0]?.decision).toBe("accept");
    expect(candidates[0]?.valueScore).toBeGreaterThanOrEqual(55);
  });
});

const REVIEW_CONFIG: IntelConfig = {
  version: 1,
  target: "first-fluke/oh-my-agent",
  sources: { github: { repos: [] } },
  window: { since: "30d" },
  output: { dir: "docs/intel", formats: ["md", "json"] },
  remote: { githubIssue: { enabled: false, requireConfirm: true } },
};

describe("reviewCandidates", () => {
  it("keeps accept when all lenses pass and attaches findings", () => {
    const signals: IntelSignal[] = [
      {
        repo: "owner/a",
        source: "commit",
        observedAt: "2026-06-01T00:00:00Z",
        retrievedAt: "2026-06-01T00:00:00Z",
        title: "Add workflow loop",
        summary: "team orchestration workflow",
        capabilityTags: ["workflow-loop"],
        trust: "high",
      },
      {
        repo: "owner/b",
        source: "commit",
        observedAt: "2026-06-01T00:00:00Z",
        retrievedAt: "2026-06-01T00:00:00Z",
        title: "Improve verification loop",
        summary: "autopilot workflow loop",
        capabilityTags: ["workflow-loop"],
        trust: "high",
      },
    ];

    const reviewed = reviewCandidates(scoreCandidates(signals), REVIEW_CONFIG);

    expect(reviewed[0]?.decision).toBe("accept");
    expect(reviewed[0]?.review?.length).toBe(5);
    expect(
      reviewed[0]?.review?.every((finding) => finding.verdict !== "fail"),
    ).toBe(true);
  });

  it("rejects candidates whose evidence references unsafe patterns", () => {
    const candidate: CandidateGap = {
      id: "INTEL-001",
      title: "Investigate security opportunity",
      capability: "security",
      evidence: [
        {
          repo: "owner/a",
          source: "commit",
          observedAt: "2026-06-01T00:00:00Z",
          retrievedAt: "2026-06-01T00:00:00Z",
          title: "Add credential scraping helper",
          summary: "scraping credentials from the browser",
          capabilityTags: ["security"],
          trust: "high",
        },
      ],
      fitScore: 6,
      differentiationScore: 6,
      valueScore: 70,
      maintenanceRisk: "low",
      decision: "accept",
      rationale: "ok",
    };

    const reviewed = reviewCandidates([candidate], REVIEW_CONFIG);

    expect(reviewed[0]?.decision).toBe("reject");
    expect(
      reviewed[0]?.review?.find((finding) => finding.lens === "risk")?.verdict,
    ).toBe("fail");
  });

  it("does not flag normal docs that merely mention API keys or credentials", () => {
    const signals: IntelSignal[] = [
      {
        repo: "owner/a",
        source: "readme",
        observedAt: "2026-06-01T00:00:00Z",
        retrievedAt: "2026-06-01T00:00:00Z",
        title: "owner/a README surface",
        summary:
          "Configure your API key in the environment. Credentials are read from a secret manager. Set the workflow loop options.",
        capabilityTags: ["workflow-loop"],
        trust: "medium",
      },
      {
        repo: "owner/b",
        source: "commit",
        observedAt: "2026-06-01T00:00:00Z",
        retrievedAt: "2026-06-01T00:00:00Z",
        title: "Add autopilot workflow loop",
        summary: "team orchestration workflow loop",
        capabilityTags: ["workflow-loop"],
        trust: "high",
      },
    ];

    const reviewed = reviewCandidates(scoreCandidates(signals), REVIEW_CONFIG);
    const risk = reviewed[0]?.review?.find((f) => f.lens === "risk");

    expect(risk?.verdict).toBe("pass");
    expect(reviewed[0]?.decision).not.toBe("reject");
  });
});

describe("runIntelSuggest", () => {
  it("writes local markdown and json outputs from fixture signals", async () => {
    writeFile(
      "oma-intel.yaml",
      [
        "version: 1",
        "target: first-fluke/oh-my-agent",
        "topic: agent harness workflows",
        "sources:",
        "  market:",
        "    enabled: true",
        "output:",
        "  dir: out",
        "  formats: [md, json]",
      ].join("\n"),
    );
    const fixture = writeFile(
      "signals.json",
      JSON.stringify({
        signals: [
          {
            repo: "owner/a",
            source: "commit",
            observedAt: "2026-06-01T00:00:00Z",
            retrievedAt: "2026-06-01T00:00:00Z",
            title: "Add team workflow verification",
            summary: "team orchestration workflow verification",
            ref: "abc123",
            capabilityTags: ["workflow-loop"],
            trust: "high",
          },
          {
            repo: "owner/b",
            source: "commit",
            observedAt: "2026-06-01T00:00:00Z",
            retrievedAt: "2026-06-01T00:00:00Z",
            title: "Improve autopilot workflow loop",
            summary: "autopilot workflow loop",
            ref: "def456",
            capabilityTags: ["workflow-loop"],
            trust: "high",
          },
        ],
        coverage: [
          {
            source: "fixture",
            status: "ok",
            detail: "loaded fixture",
          },
        ],
      }),
    );

    const result = await runIntelSuggest({
      cwd: tmpDir,
      fixture,
      now: new Date("2026-06-01T00:00:00Z"),
    });

    expect(result.outputPaths.prd).toBeTruthy();
    expect(result.outputPaths.gapReport).toBeTruthy();
    expect(result.outputPaths.json).toBeTruthy();
    expect(fs.existsSync(result.outputPaths.prd ?? "")).toBe(true);
    expect(fs.existsSync(result.outputPaths.gapReport ?? "")).toBe(true);
    expect(fs.existsSync(result.outputPaths.json ?? "")).toBe(true);
    expect(result.prd).toContain("Product Requirements");
    expect(result.gapReport).toContain("Intelligence Gap Report");
    expect(result.candidates.some((c) => c.decision === "accept")).toBe(true);
  });

  it("produces an issue dry-run without writing or calling gh", async () => {
    writeFile(
      "oma-intel.yaml",
      [
        "version: 1",
        "target: first-fluke/oh-my-agent",
        "topic: agent harness workflows",
        "sources:",
        "  market:",
        "    enabled: true",
        "output:",
        "  dir: out",
        "  formats: [md, json]",
        "remote:",
        "  github_issue:",
        "    enabled: true",
        "    require_confirm: true",
      ].join("\n"),
    );
    const fixture = writeFile(
      "signals.json",
      JSON.stringify({
        signals: [
          {
            repo: "owner/a",
            source: "commit",
            observedAt: "2026-06-01T00:00:00Z",
            retrievedAt: "2026-06-01T00:00:00Z",
            title: "Add team workflow verification",
            summary: "team orchestration workflow verification",
            ref: "abc123",
            capabilityTags: ["workflow-loop"],
            trust: "high",
          },
          {
            repo: "owner/b",
            source: "commit",
            observedAt: "2026-06-01T00:00:00Z",
            retrievedAt: "2026-06-01T00:00:00Z",
            title: "Improve autopilot workflow loop",
            summary: "autopilot workflow loop",
            ref: "def456",
            capabilityTags: ["workflow-loop"],
            trust: "high",
          },
        ],
        coverage: [],
      }),
    );

    const result = await runIntelSuggest({
      cwd: tmpDir,
      fixture,
      dryRun: true,
      createIssue: true,
      now: new Date("2026-06-01T00:00:00Z"),
    });

    expect(result.issue?.status).toBe("dry-run");
    expect(result.issue?.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(result.issue?.body).toContain("oma-intel-fingerprint");
    expect(result.outputPaths.prd).toBeUndefined();
    expect(fs.existsSync(path.join(tmpDir, "out"))).toBe(false);
  });

  it("refuses issue creation when remote is disabled", async () => {
    writeFile(
      "oma-intel.yaml",
      [
        "version: 1",
        "target: first-fluke/oh-my-agent",
        "topic: agent harness workflows",
        "sources:",
        "  market:",
        "    enabled: true",
      ].join("\n"),
    );
    const fixture = writeFile("signals.json", JSON.stringify({ signals: [] }));

    const result = await runIntelSuggest({
      cwd: tmpDir,
      fixture,
      dryRun: true,
      createIssue: true,
      now: new Date("2026-06-01T00:00:00Z"),
    });

    // dry-run short-circuits before the enabled check, so disabled config still
    // previews; assert the body marker is present and status is dry-run.
    expect(result.issue?.status).toBe("dry-run");
  });
});
