import { existsSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";

/**
 * Resolve a path to its canonical (symlink-free) form. For not-yet-existing
 * paths, canonicalizes the deepest existing ancestor and re-joins the rest,
 * so containment checks cannot be bypassed via symlinked parents.
 */
export function canonicalPath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    if (existsSync(p)) return p;
    const parent = path.dirname(p);
    if (parent === p) return p;
    return path.join(canonicalPath(parent), path.basename(p));
  }
}

export function isPathWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export interface EnsureRunDirArgs {
  /** Fully resolved output directory the caller wants to create. */
  resolved: string;
  cwd: string;
  /** When false, `resolved` must stay inside `cwd` (after symlink resolution). */
  allowExternal: boolean;
  /** Original `--out` flag value, echoed verbatim in the error message. */
  outFlag?: string;
}

/**
 * Containment-guarded run-directory creation shared by feature slices.
 * Throws when the resolved directory escapes `cwd` without the explicit
 * `--allow-external-out` opt-in; otherwise creates it recursively.
 */
export function ensureRunDirWithinCwd(args: EnsureRunDirArgs): string {
  const absCwd = canonicalPath(args.cwd);
  const absOut = canonicalPath(args.resolved);
  if (!args.allowExternal && !isPathWithin(absOut, absCwd)) {
    throw new Error(
      `--out path "${args.outFlag ?? args.resolved}" is outside $PWD. Use --allow-external-out to override.`,
    );
  }
  mkdirSync(args.resolved, { recursive: true });
  return args.resolved;
}
