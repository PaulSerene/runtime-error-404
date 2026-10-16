/**
 * Web Worker: runs analyze() off the main thread so the UI never blocks.
 * Loaded via new Worker(new URL('./analyze.worker.ts', import.meta.url)).
 */
import { analyze } from "../engine/index";

self.onmessage = (e: MessageEvent) => {
  const { logCsv, assetsCsv, ipLocCsv, config } = e.data as {
    logCsv: string;
    assetsCsv: string | undefined;
    ipLocCsv: string | undefined;
    config: import("../types").Config;
  };

  try {
    const result = analyze(logCsv, config, assetsCsv, ipLocCsv);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
