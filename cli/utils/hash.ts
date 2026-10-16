import { createHash } from "node:crypto";

/** Full SHA-256 hex digest of string or binary content. */
export function sha256Hex(
  value: string | Buffer,
  encoding?: BufferEncoding,
): string {
  const hash = createHash("sha256");
  if (typeof value === "string") {
    hash.update(value, encoding ?? "utf-8");
  } else {
    hash.update(value);
  }
  return hash.digest("hex");
}

/** First 16 hex chars of SHA-256 over JSON-serialized value (stable for plain objects/arrays). */
export function shortHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Cursor stores chat DBs under `~/.cursor/chats/{md5(workspacePath)}/`.
 * Must match Cursor's on-disk layout (MD5, not SHA-256).
 */
export function cursorWorkspaceChatHash(workspacePath: string): string {
  return createHash("md5").update(workspacePath).digest("hex");
}
