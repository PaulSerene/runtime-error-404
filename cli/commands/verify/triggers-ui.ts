import * as p from "@clack/prompts";
import pc from "picocolors";
import type { TriggerAccuracyReport } from "./triggers-score.js";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export interface TriggerThresholds {
  maxFalseFire: number;
  maxMissedFire: number;
}

export function renderTriggersReport(
  report: TriggerAccuracyReport,
  thresholds: TriggerThresholds,
  passed: boolean,
): void {
  p.intro(pc.bgCyan(pc.white(" oma verify triggers ")));

  const { totals } = report;
  p.note(
    [
      `${totals.total} prompts (${totals.positives} positive, ${totals.negatives} negative)`,
      `missed-fire rate: ${pct(totals.missedFireRate)} (${totals.missedFires}/${totals.positives}) — threshold ${thresholds.maxMissedFire}%`,
      `false-fire rate:  ${pct(totals.falseFireRate)} (${totals.falseFires}/${totals.negatives}) — threshold ${thresholds.maxFalseFire}%`,
    ].join("\n"),
    "Summary",
  );

  console.log(pc.bold("\nPer-workflow"));
  console.log(
    "workflow".padEnd(14),
    "support".padEnd(9),
    "recall".padEnd(9),
    "precision",
  );
  for (const w of report.perWorkflow) {
    console.log(
      w.workflow.padEnd(14),
      String(w.support).padEnd(9),
      pct(w.recall).padEnd(9),
      pct(w.precision),
    );
  }

  console.log(pc.bold("\nPer-language"));
  console.log(
    "lang".padEnd(6),
    "positives".padEnd(11),
    "missed%".padEnd(9),
    "negatives".padEnd(11),
    "false%",
  );
  for (const l of report.perLanguage) {
    console.log(
      l.lang.padEnd(6),
      String(l.positives).padEnd(11),
      pct(l.missedFireRate).padEnd(9),
      String(l.negatives).padEnd(11),
      pct(l.falseFireRate),
    );
  }

  if (report.worstOffenders.length > 0) {
    console.log(pc.bold("\nWorst offenders (false fires)"));
    for (const o of report.worstOffenders) {
      const prompt =
        o.prompt.length > 60 ? `${o.prompt.slice(0, 57)}...` : o.prompt;
      console.log(
        pc.red(`[${o.detected}]`),
        pc.dim(`(${o.lang})`),
        `"${prompt}"`,
        o.matchedKeyword ? pc.dim(`— matched: "${o.matchedKeyword}"`) : "",
      );
    }
  }

  if (report.missedFindings.length > 0) {
    console.log(pc.bold("\nMissed fires"));
    for (const m of report.missedFindings) {
      const prompt =
        m.prompt.length > 60 ? `${m.prompt.slice(0, 57)}...` : m.prompt;
      console.log(
        pc.yellow(`[expected ${m.expected}, got ${m.detected ?? "none"}]`),
        pc.dim(`(${m.lang})`),
        `"${prompt}"`,
      );
    }
  }

  console.log();
  if (passed) {
    p.outro(pc.green("✅ Trigger accuracy within thresholds"));
  } else {
    p.outro(pc.red("❌ Trigger accuracy exceeded thresholds"));
  }
}
