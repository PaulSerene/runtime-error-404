/**
 * Run-artifact naming helpers shared by feature slices (image, video, …).
 *
 * Slices must not import from each other (cli/ARCHITECTURE.md rule 1), so
 * each slice re-exports what it needs from its local `naming.ts` facade and
 * keeps slice-specific run-id shapes there.
 */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function shortId(length = 6): string {
  let out = "";
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i += 1) {
    const byte = bytes[i] ?? 0;
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

/** `YYYYMMDD-HHmmss` in local time, for run-directory names. */
export function formatTimestamp(date = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Replace `{key}` placeholders; unknown keys are left verbatim. */
export function renderPattern(
  pattern: string,
  vars: Record<string, string>,
): string {
  return pattern.replace(
    /\{(\w+)\}/g,
    (_m, key: string) => vars[key] ?? `{${key}}`,
  );
}

/** ISO-8601 local time with explicit UTC offset (`2026-01-02T03:04:05+09:00`). */
export function isoWithOffset(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset}`
  );
}
