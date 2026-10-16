import { describe, expect, it } from "vitest";
import { type ScoredEntry, scoreDetections } from "./triggers-score.js";

// Fixed fixture chosen so every rate divides evenly — exact expected metrics,
// no floating-point tolerance needed.
const FIXTURE: ScoredEntry[] = [
  // orchestrate: 2/4 positives correctly detected (recall 0.5)
  {
    prompt: "p1",
    lang: "en",
    expected: "orchestrate",
    detected: "orchestrate",
  },
  {
    prompt: "p2",
    lang: "en",
    expected: "orchestrate",
    detected: "orchestrate",
  },
  { prompt: "p3", lang: "ko", expected: "orchestrate", detected: null },
  { prompt: "p4", lang: "ko", expected: "orchestrate", detected: "debug" },
  // debug: 2/2 positives correctly detected (recall 1.0), but one extra
  // spurious "debug" fire came from p4 above → precision = 2/3
  { prompt: "p5", lang: "en", expected: "debug", detected: "debug" },
  { prompt: "p6", lang: "en", expected: "debug", detected: "debug" },
  // negatives: 4 total, 1 false fire (missing → 3/4 clean)
  { prompt: "n1", lang: "en", expected: null, detected: null },
  { prompt: "n2", lang: "en", expected: null, detected: null },
  { prompt: "n3", lang: "ko", expected: null, detected: null },
  {
    prompt: "n4",
    lang: "ko",
    expected: null,
    detected: "orchestrate",
    matchedKeyword: "전부",
    note: "false-fire probe",
  },
];

describe("scoreDetections", () => {
  it("computes exact overall totals", () => {
    const report = scoreDetections(FIXTURE);
    expect(report.totals.total).toBe(10);
    expect(report.totals.positives).toBe(6);
    expect(report.totals.negatives).toBe(4);
    // missed: p3 (null vs orchestrate), p4 (debug vs orchestrate) → 2/6
    expect(report.totals.missedFires).toBe(2);
    expect(report.totals.missedFireRate).toBeCloseTo(2 / 6);
    // false fires: n4 → 1/4
    expect(report.totals.falseFires).toBe(1);
    expect(report.totals.falseFireRate).toBe(0.25);
  });

  it("computes exact per-workflow recall/precision", () => {
    const report = scoreDetections(FIXTURE);
    const orchestrate = report.perWorkflow.find(
      (w) => w.workflow === "orchestrate",
    );
    expect(orchestrate).toEqual({
      workflow: "orchestrate",
      support: 4,
      truePositives: 2,
      firedCount: 3, // p1, p2, n4
      recall: 0.5,
      precision: 2 / 3,
    });

    const debug = report.perWorkflow.find((w) => w.workflow === "debug");
    expect(debug).toEqual({
      workflow: "debug",
      support: 2,
      truePositives: 2,
      firedCount: 3, // p4, p5, p6
      recall: 1,
      precision: 2 / 3,
    });
  });

  it("computes exact per-language rates", () => {
    const report = scoreDetections(FIXTURE);
    const en = report.perLanguage.find((l) => l.lang === "en");
    expect(en).toEqual({
      lang: "en",
      positives: 4, // p1, p2, p5, p6
      missedFires: 0,
      missedFireRate: 0,
      negatives: 2, // n1, n2
      falseFires: 0,
      falseFireRate: 0,
    });

    const ko = report.perLanguage.find((l) => l.lang === "ko");
    expect(ko).toEqual({
      lang: "ko",
      positives: 2, // p3, p4
      missedFires: 2,
      missedFireRate: 1,
      negatives: 2, // n3, n4
      falseFires: 1,
      falseFireRate: 0.5,
    });
  });

  it("lists worst offenders (false fires) with matched keyword", () => {
    const report = scoreDetections(FIXTURE);
    expect(report.worstOffenders).toEqual([
      {
        prompt: "n4",
        lang: "ko",
        detected: "orchestrate",
        matchedKeyword: "전부",
        note: "false-fire probe",
      },
    ]);
  });

  it("lists missed findings for positives that didn't match expected", () => {
    const report = scoreDetections(FIXTURE);
    expect(report.missedFindings).toEqual([
      {
        prompt: "p3",
        lang: "ko",
        expected: "orchestrate",
        detected: null,
        note: undefined,
      },
      {
        prompt: "p4",
        lang: "ko",
        expected: "orchestrate",
        detected: "debug",
        note: undefined,
      },
    ]);
  });

  it("handles an empty corpus without dividing by zero", () => {
    const report = scoreDetections([]);
    expect(report.totals).toEqual({
      total: 0,
      positives: 0,
      negatives: 0,
      missedFires: 0,
      missedFireRate: 0,
      falseFires: 0,
      falseFireRate: 0,
    });
    expect(report.perWorkflow).toEqual([]);
    expect(report.perLanguage).toEqual([]);
  });

  it("handles all-positive corpora with zero negatives (falseFireRate stays 0, not NaN)", () => {
    const report = scoreDetections([
      { prompt: "p1", lang: "en", expected: "debug", detected: "debug" },
    ]);
    expect(report.totals.falseFireRate).toBe(0);
    expect(report.totals.negatives).toBe(0);
  });
});
