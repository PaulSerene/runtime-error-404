import readline from "node:readline";
import type { ImageConfig } from "./config.js";
import type { VendorProvider } from "./types.js";

export interface EstimateArgs {
  config: ImageConfig;
  providers: VendorProvider[];
  modelByVendor: Record<string, string | undefined>;
  quality: string;
  count: number;
  referenceCount?: number;
}

export function estimateCost({
  config,
  providers,
  modelByVendor,
  quality,
  count,
}: EstimateArgs): number {
  let total = 0;
  for (const p of providers) {
    const model = modelByVendor[p.name] ?? config.vendors[p.name]?.model;
    if (!model) continue;
    const perImage =
      config.costGuardrail.perImageUsd[p.name]?.[model]?.[quality] ??
      config.costGuardrail.perImageUsd[p.name]?.[model]?.auto ??
      0;
    total += perImage * count;
  }
  return total;
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

export type CostGate = "proceed" | "prompt" | "block-non-interactive";

// Decide how the cost guardrail applies before dispatch. Non-interactive
// callers (agents, CI) cannot answer a stdin prompt, so instead of silently
// auto-declining we block with an actionable message telling them to re-run
// with --yes after confirming with the user.
export function costGateDecision(args: {
  estimate: number;
  thresholdUsd: number;
  skipConfirm: boolean;
  isTTY: boolean;
}): CostGate {
  if (args.skipConfirm || args.estimate < args.thresholdUsd) return "proceed";
  return args.isTTY ? "prompt" : "block-non-interactive";
}

export async function promptConfirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer: string = await new Promise((resolve) => {
      rl.question(question, (a) => resolve(a));
    });
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
