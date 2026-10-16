/**
 * Data-access layer for the analysis result.
 * Currently backed by sampleResult; swap `analyze()` in later.
 */
import type { AnalysisResult } from "@/types";
import { sampleResult } from "@/fixtures/sampleResult";

/** Returns the current analysis result. */
export function getResult(): AnalysisResult {
  return sampleResult;
}
