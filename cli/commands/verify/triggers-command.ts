import { DEFAULT_CORPUS_PATH, loadTriggerCorpus } from "./triggers-corpus.js";
import { detectAll } from "./triggers-detect.js";
import {
  scoreDetections,
  type TriggerAccuracyReport,
} from "./triggers-score.js";

export const DEFAULT_MAX_FALSE_FIRE_PCT = 10;
export const DEFAULT_MAX_MISSED_FIRE_PCT = 20;

export interface RunVerifyTriggersOptions {
  corpusPath?: string;
  maxFalseFire?: number;
  maxMissedFire?: number;
}

export interface RunVerifyTriggersResult {
  report: TriggerAccuracyReport;
  thresholds: { maxFalseFire: number; maxMissedFire: number };
  passed: boolean;
}

export async function runVerifyTriggers(
  options: RunVerifyTriggersOptions = {},
): Promise<RunVerifyTriggersResult> {
  const corpusPath = options.corpusPath ?? DEFAULT_CORPUS_PATH;
  const maxFalseFire = options.maxFalseFire ?? DEFAULT_MAX_FALSE_FIRE_PCT;
  const maxMissedFire = options.maxMissedFire ?? DEFAULT_MAX_MISSED_FIRE_PCT;

  const entries = loadTriggerCorpus(corpusPath);
  const outcomes = await detectAll(entries);
  const report = scoreDetections(
    outcomes.map((o) => ({
      prompt: o.entry.prompt,
      lang: o.entry.lang,
      expected: o.entry.expected,
      detected: o.detected,
      matchedKeyword: o.matchedKeyword,
      note: o.entry.note,
    })),
  );

  const passed =
    report.totals.falseFireRate * 100 <= maxFalseFire &&
    report.totals.missedFireRate * 100 <= maxMissedFire;

  return { report, thresholds: { maxFalseFire, maxMissedFire }, passed };
}
