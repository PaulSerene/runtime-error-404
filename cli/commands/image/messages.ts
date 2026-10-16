export interface Messages {
  promptRequired: string;
  countOutOfRange: string;
  invalidSize: (reason: string) => string;
  unknownVendor: (name: string) => string;
  authFailureHeader: string;
  runDoctor: string;
  dryRunHeader: string;
  costConfirm: (cost: string) => string;
  costDeclined: string;
  costConfirmNonInteractive: (cost: string) => string;
  using: (vendors: string) => string;
  heartbeat: (vendor: string, elapsedSec: number) => string;
  runOk: (vendor: string, ms: number, file: string) => string;
  runFailed: (vendor: string, kind: string, reason: string) => string;
  manifestWritten: (path: string) => string;
}

const en: Messages = {
  promptRequired: "prompt is required",
  countOutOfRange: "count must be between 1 and 5",
  invalidSize: (reason) => `invalid --size: ${reason}`,
  unknownVendor: (name) => `unknown vendor: ${name}`,
  authFailureHeader: "[oma image] No authenticated vendors available.",
  runDoctor: "Run: oma image doctor",
  dryRunHeader: "[oma image] dry-run plan:",
  costConfirm: (cost) => `Estimated cost ${cost}. Proceed? (y/N) `,
  costDeclined: "[oma image] Cancelled by user.",
  costConfirmNonInteractive: (cost) =>
    `[oma image] Estimated cost ${cost} requires confirmation, but no interactive terminal is attached. Re-run with --yes (or OMA_IMAGE_YES=1) after confirming with the user.`,
  using: (vendors) => `[oma image] using: ${vendors}`,
  heartbeat: (vendor, elapsed) =>
    `[oma image] ${vendor} generating... ${elapsed}s`,
  runOk: (vendor, ms, file) =>
    `[oma image] ${vendor} ok (${(ms / 1000).toFixed(1)}s) -> ${file}`,
  runFailed: (vendor, kind, reason) =>
    `[oma image] ${vendor} failed (${kind}): ${reason}`,
  manifestWritten: (p) => `[oma image] manifest: ${p}`,
};

const ko: Messages = {
  promptRequired: "프롬프트가 비어 있습니다",
  countOutOfRange: "count는 1과 5 사이여야 합니다",
  invalidSize: (reason) => `잘못된 --size: ${reason}`,
  unknownVendor: (name) => `알 수 없는 vendor: ${name}`,
  authFailureHeader: "[oma image] 인증된 vendor가 없습니다.",
  runDoctor: "실행: oma image doctor",
  dryRunHeader: "[oma image] dry-run 계획:",
  costConfirm: (cost) => `예상 비용 ${cost}. 진행할까요? (y/N) `,
  costDeclined: "[oma image] 사용자가 취소했습니다.",
  costConfirmNonInteractive: (cost) =>
    `[oma image] 예상 비용 ${cost}은(는) 확인이 필요하지만 대화형 터미널이 연결되어 있지 않습니다. 사용자 확인 후 --yes(또는 OMA_IMAGE_YES=1)로 다시 실행하세요.`,
  using: (vendors) => `[oma image] 사용 vendor: ${vendors}`,
  heartbeat: (vendor, elapsed) =>
    `[oma image] ${vendor} 생성 중... ${elapsed}s`,
  runOk: (vendor, ms, file) =>
    `[oma image] ${vendor} 완료 (${(ms / 1000).toFixed(1)}s) -> ${file}`,
  runFailed: (vendor, kind, reason) =>
    `[oma image] ${vendor} 실패 (${kind}): ${reason}`,
  manifestWritten: (p) => `[oma image] manifest: ${p}`,
};

export function getMessages(language: string): Messages {
  if (language?.toLowerCase().startsWith("ko")) return ko;
  return en;
}
