import { jsonrepair } from "jsonrepair";

/**
 * Parse a JSON object out of raw agent output.
 *
 * Agent output is rarely clean JSON: it may be wrapped in a ```json fence or
 * prose, use single quotes / Python constants, carry a trailing comma, or be
 * truncated mid-string. We delegate the actual repair to `jsonrepair` (the
 * battle-tested JS counterpart of PyPI's json-repair), which handles fences,
 * trailing commas, unclosed brackets/strings, comments, JSONP wrappers, and
 * more — cases a hand-rolled substring slice cannot fix.
 *
 * Two candidates are tried, each first as strict JSON (fast path for already
 * valid output) then via `jsonrepair`:
 *  1. the whole trimmed string — handles fenced/truncated/loose JSON
 *  2. the first-`{`-to-last-`}` slice — handles a JSON object embedded in prose
 *
 * Only a JSON **object** is accepted. `jsonrepair` is aggressive enough to
 * coerce bare prose into a JSON string ("I can't help" -> `"I can't help"`), so
 * without this guard a refusal would slip through as valid output; requiring an
 * object keeps pure prose / refusals rejected (the caller then retries).
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAgentJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }
  for (const candidate of candidates) {
    try {
      const strict = JSON.parse(candidate);
      if (isJsonObject(strict)) return strict;
    } catch {
      // not strict JSON — try repairing it
    }
    try {
      const repaired = JSON.parse(jsonrepair(candidate));
      if (isJsonObject(repaired)) return repaired;
    } catch {
      // unrepairable — try the next candidate
    }
  }
  throw new Error("No parseable JSON in agent output.");
}

/**
 * Generate-and-parse with bounded retry.
 *
 * The SNS author/translator/reviewer steps depend on an LLM returning a strict
 * JSON envelope. LLM output is non-deterministic: a single run occasionally
 * emits prose, a refusal, or truncated text with no parseable JSON, which makes
 * `parse` throw and aborts the whole publish for that period. Retrying the
 * agent a few times turns a flaky one-shot into a reliable step.
 *
 * `parse` returning a value (including a legitimate skip payload) is success and
 * is returned immediately — only a thrown parse error triggers a retry. After
 * all attempts are exhausted the last error is rethrown so callers still fail
 * loudly rather than publishing nothing silently.
 */
export function withParseRetry<T>(
  produce: () => string,
  parse: (raw: string) => T,
  opts: {
    attempts?: number;
    onRetry?: (attempt: number, total: number, err: Error) => void;
  } = {},
): T {
  const attempts = Math.max(1, opts.attempts ?? 3);
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i += 1) {
    const raw = produce();
    try {
      return parse(raw);
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        opts.onRetry?.(
          i,
          attempts,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
