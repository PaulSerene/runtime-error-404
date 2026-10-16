import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CORPUS_PATH, loadTriggerCorpus } from "./triggers-corpus.js";

let scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs = [];
});

function writeCorpus(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "oma-verify-triggers-corpus-"));
  scratchDirs.push(dir);
  const path = join(dir, "corpus.json");
  writeFileSync(path, JSON.stringify(content));
  return path;
}

describe("loadTriggerCorpus", () => {
  it("loads and validates a well-formed corpus", () => {
    const path = writeCorpus([
      { prompt: "review this", lang: "en", expected: "review" },
      { prompt: "hello", lang: "en", expected: null, note: "clean negative" },
    ]);
    const entries = loadTriggerCorpus(path);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      prompt: "review this",
      lang: "en",
      expected: "review",
      note: undefined,
    });
    expect(entries[1]?.note).toBe("clean negative");
  });

  it("rejects a corpus that isn't a JSON array", () => {
    const path = writeCorpus({ not: "an array" });
    expect(() => loadTriggerCorpus(path)).toThrow(/must be a JSON array/);
  });

  it("rejects an entry missing prompt", () => {
    const path = writeCorpus([{ lang: "en", expected: null }]);
    expect(() => loadTriggerCorpus(path)).toThrow(/"prompt"/);
  });

  it("rejects an entry missing lang", () => {
    const path = writeCorpus([{ prompt: "x", expected: null }]);
    expect(() => loadTriggerCorpus(path)).toThrow(/"lang"/);
  });

  it("rejects an entry whose expected is not a string or null", () => {
    const path = writeCorpus([{ prompt: "x", lang: "en", expected: 42 }]);
    expect(() => loadTriggerCorpus(path)).toThrow(/"expected"/);
  });

  it("rejects malformed JSON with a readable error", () => {
    const dir = mkdtempSync(join(tmpdir(), "oma-verify-triggers-corpus-"));
    scratchDirs.push(dir);
    const path = join(dir, "corpus.json");
    writeFileSync(path, "{not json");
    expect(() => loadTriggerCorpus(path)).toThrow(/not valid JSON/);
  });

  it("the real starter corpus is well-formed and has a meaningful sample size", () => {
    const entries = loadTriggerCorpus(DEFAULT_CORPUS_PATH);
    expect(entries.length).toBeGreaterThanOrEqual(120);
    const positives = entries.filter((e) => e.expected !== null);
    const negatives = entries.filter((e) => e.expected === null);
    expect(positives.length).toBeGreaterThan(0);
    expect(negatives.length).toBeGreaterThan(0);
    // every entry has a non-empty prompt and a lang tag
    for (const e of entries) {
      expect(e.prompt.length).toBeGreaterThan(0);
      expect(e.lang.length).toBeGreaterThan(0);
    }
  });
});
