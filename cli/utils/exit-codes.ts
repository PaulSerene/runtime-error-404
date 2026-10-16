/**
 * Standard CLI exit-code scale shared by the feature slices that report
 * machine-readable failure classes (image, video, search).
 *
 * The values are an EXTERNAL CONTRACT — wrapper scripts and docs match on
 * them — so never renumber; only add.
 */
export const EXIT_CODES = {
  ok: 0,
  generic: 1,
  /** Provider/safety refusal or blocked content. */
  safety: 2,
  notFound: 3,
  invalidInput: 4,
  /** Missing credentials or provider binary. */
  authRequired: 5,
  timeout: 6,
} as const;

export type StandardExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * Map a result status / error-kind string to its standard exit code.
 * Unknown or missing statuses fall back to `generic` (1).
 */
const STATUS_TO_EXIT: Record<string, StandardExitCode> = {
  ok: EXIT_CODES.ok,
  blocked: EXIT_CODES.safety,
  "safety-refused": EXIT_CODES.safety,
  "not-found": EXIT_CODES.notFound,
  "invalid-input": EXIT_CODES.invalidInput,
  "auth-required": EXIT_CODES.authRequired,
  "not-installed": EXIT_CODES.authRequired,
  timeout: EXIT_CODES.timeout,
};

export function exitCodeForStatus(
  status: string | undefined,
): StandardExitCode {
  if (status === undefined) return EXIT_CODES.generic;
  return STATUS_TO_EXIT[status] ?? EXIT_CODES.generic;
}
