import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * One labeled prompt in the trigger-accuracy corpus.
 *
 * `expected` is the workflow name (a key of `.agents/hooks/core/triggers.json`
 * `workflows`) the prompt SHOULD activate, or `null` if it must NOT activate
 * any workflow (hard negative — contains a trigger keyword in a
 * non-triggering context — or clean negative — no workflow intent at all).
 */
export interface TriggerCorpusEntry {
  prompt: string;
  lang: string;
  expected: string | null;
  note?: string;
}

export const DEFAULT_CORPUS_PATH = fileURLToPath(
  new URL("./fixtures/triggers-corpus.json", import.meta.url),
);

function assertEntry(value: unknown, index: number): TriggerCorpusEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Corpus entry ${index} must be an object`);
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.prompt !== "string" || entry.prompt.length === 0) {
    throw new Error(`Corpus entry ${index} is missing a non-empty "prompt"`);
  }
  if (typeof entry.lang !== "string" || entry.lang.length === 0) {
    throw new Error(`Corpus entry ${index} is missing a non-empty "lang"`);
  }
  if (entry.expected !== null && typeof entry.expected !== "string") {
    throw new Error(
      `Corpus entry ${index} ("expected") must be a workflow name string or null`,
    );
  }
  if (entry.note !== undefined && typeof entry.note !== "string") {
    throw new Error(`Corpus entry ${index} ("note") must be a string`);
  }
  return {
    prompt: entry.prompt,
    lang: entry.lang,
    expected: entry.expected,
    note: entry.note as string | undefined,
  };
}

/** Load and validate a trigger-accuracy corpus from a JSON file (an array of entries). */
export function loadTriggerCorpus(
  path: string = DEFAULT_CORPUS_PATH,
): TriggerCorpusEntry[] {
  const raw = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Corpus at ${path} is not valid JSON: ${msg}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Corpus at ${path} must be a JSON array of entries`);
  }
  return parsed.map((entry, index) => assertEntry(entry, index));
}
