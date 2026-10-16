import { writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import { isoWithOffset } from "../../utils/run-naming.js";

export { isoWithOffset } from "../../utils/run-naming.js";

import type { Manifest, ManifestRun } from "./types.js";

export interface WriteManifestArgs {
  outDir: string;
  runId: { timestamp: string; shortid: string };
  prompt: string;
  includePrompt: boolean;
  options: { size: string; quality: string; count: number };
  costEstimate: number;
  runs: ManifestRun[];
  startedAt: number;
  referenceImages?: string[];
}

export async function writeManifest(args: WriteManifestArgs): Promise<string> {
  const manifest: Manifest = {
    schema_version: 1,
    timestamp: isoWithOffset(new Date(args.startedAt)),
    options: args.options,
    cost_estimate_usd: Number(args.costEstimate.toFixed(4)),
    runs: args.runs,
  };
  if (args.includePrompt) {
    manifest.prompt = args.prompt;
  } else {
    manifest.prompt_sha256 = sha256Hex(args.prompt);
  }
  if (args.referenceImages && args.referenceImages.length > 0) {
    manifest.reference_images = [...args.referenceImages];
  }

  const manifestPath = path.join(args.outDir, "manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifestPath;
}
