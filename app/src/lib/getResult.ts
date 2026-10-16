/**
 * Data-access layer for the analysis result.
 *
 * - getResult()    → returns the hand-authored fixture (for "Load sample data")
 * - analyzeFile()  → reads real CSVs in a Web Worker so the UI never freezes
 */
import type { AnalysisResult, Config } from "@/types";
import { sampleResult } from "@/fixtures/sampleResult";

/** Returns the sample fixture — used by the "Load sample data" button. */
export function getResult(): AnalysisResult {
  return sampleResult;
}

/**
 * Runs the real engine inside a Web Worker.
 *
 * @param logCsv    Raw text of the log CSV.
 * @param assetsCsv Optional assets CSV text.
 * @param ipLocCsv  Optional IP-location CSV text.
 * @param config    Analysis configuration built from the upload form.
 */
export function analyzeFile(
  logCsv: string,
  assetsCsv: string | undefined,
  ipLocCsv: string | undefined,
  config: Config,
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    // new Worker(new URL(...)) is the standard way to create a worker that
    // bundlers (Turbopack, webpack) can statically analyse and bundle.
    const worker = new Worker(
      new URL("../workers/analyze.worker.ts", import.meta.url),
    );

    worker.onmessage = (e: MessageEvent<{ ok: true; result: AnalysisResult } | { ok: false; error: string }>) => {
      worker.terminate();
      if (e.data.ok) {
        resolve(e.data.result);
      } else {
        reject(new Error(e.data.error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message ?? "Worker error"));
    };

    worker.postMessage({ logCsv, assetsCsv, ipLocCsv, config });
  });
}
