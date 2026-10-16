/**
 * Pure scoring for the trigger-accuracy eval — no filesystem/process access,
 * so it can be unit-tested against a fixed fixture for exact metrics.
 */
export interface ScoredEntry {
  prompt: string;
  lang: string;
  expected: string | null;
  detected: string | null;
  matchedKeyword?: string | null;
  note?: string;
}

export interface WorkflowStat {
  workflow: string;
  /** Positives that expected this workflow. */
  support: number;
  truePositives: number;
  /** Total times this workflow fired (TP + FP), across the whole corpus. */
  firedCount: number;
  recall: number;
  precision: number;
}

export interface LanguageStat {
  lang: string;
  positives: number;
  missedFires: number;
  missedFireRate: number;
  negatives: number;
  falseFires: number;
  falseFireRate: number;
}

export interface OffenderFinding {
  prompt: string;
  lang: string;
  detected: string;
  matchedKeyword: string | null;
  note?: string;
}

export interface MissedFinding {
  prompt: string;
  lang: string;
  expected: string;
  detected: string | null;
  note?: string;
}

export interface TriggerAccuracyReport {
  totals: {
    total: number;
    positives: number;
    negatives: number;
    missedFires: number;
    missedFireRate: number;
    falseFires: number;
    falseFireRate: number;
  };
  perWorkflow: WorkflowStat[];
  perLanguage: LanguageStat[];
  worstOffenders: OffenderFinding[];
  missedFindings: MissedFinding[];
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function scoreDetections(entries: ScoredEntry[]): TriggerAccuracyReport {
  const positives = entries.filter((e) => e.expected !== null);
  const negatives = entries.filter((e) => e.expected === null);
  const missed = positives.filter((e) => e.detected !== e.expected);
  const falseFires = negatives.filter((e) => e.detected !== null);

  const workflowNames = new Set<string>();
  for (const e of entries) {
    if (e.expected) workflowNames.add(e.expected);
    if (e.detected) workflowNames.add(e.detected);
  }

  const perWorkflow: WorkflowStat[] = [...workflowNames]
    .sort()
    .map((workflow) => {
      const support = entries.filter((e) => e.expected === workflow).length;
      const truePositives = entries.filter(
        (e) => e.expected === workflow && e.detected === workflow,
      ).length;
      const firedCount = entries.filter((e) => e.detected === workflow).length;
      return {
        workflow,
        support,
        truePositives,
        firedCount,
        recall: rate(truePositives, support),
        precision: rate(truePositives, firedCount),
      };
    });

  const languages = new Set(entries.map((e) => e.lang));
  const perLanguage: LanguageStat[] = [...languages].sort().map((lang) => {
    const langPositives = positives.filter((e) => e.lang === lang);
    const langNegatives = negatives.filter((e) => e.lang === lang);
    const langMissed = langPositives.filter((e) => e.detected !== e.expected);
    const langFalseFires = langNegatives.filter((e) => e.detected !== null);
    return {
      lang,
      positives: langPositives.length,
      missedFires: langMissed.length,
      missedFireRate: rate(langMissed.length, langPositives.length),
      negatives: langNegatives.length,
      falseFires: langFalseFires.length,
      falseFireRate: rate(langFalseFires.length, langNegatives.length),
    };
  });

  const worstOffenders: OffenderFinding[] = falseFires
    .filter((e): e is ScoredEntry & { detected: string } => e.detected !== null)
    .map((e) => ({
      prompt: e.prompt,
      lang: e.lang,
      detected: e.detected,
      matchedKeyword: e.matchedKeyword ?? null,
      note: e.note,
    }))
    .sort((a, b) => a.detected.localeCompare(b.detected));

  const missedFindings: MissedFinding[] = missed
    .filter((e): e is ScoredEntry & { expected: string } => e.expected !== null)
    .map((e) => ({
      prompt: e.prompt,
      lang: e.lang,
      expected: e.expected,
      detected: e.detected,
      note: e.note,
    }))
    .sort((a, b) => a.expected.localeCompare(b.expected));

  return {
    totals: {
      total: entries.length,
      positives: positives.length,
      negatives: negatives.length,
      missedFires: missed.length,
      missedFireRate: rate(missed.length, positives.length),
      falseFires: falseFires.length,
      falseFireRate: rate(falseFires.length, negatives.length),
    },
    perWorkflow,
    perLanguage,
    worstOffenders,
    missedFindings,
  };
}
