import { isAbsolute, join, resolve, sep } from "node:path";

/**
 * Normalize a resolved path for containment comparison.
 *
 * On case-insensitive filesystems (macOS APFS/HFS+, Windows NTFS) a
 * differently-cased path would bypass a raw byte-level `startsWith` check.
 * Lowercasing both sides before comparing closes that bypass while keeping
 * the original casing intact in the returned value.
 *
 * Linux filesystems are case-sensitive, so no normalization is applied there.
 */
export function normalizeCaseForContainment(p: string): string {
  if (process.platform === "win32" || process.platform === "darwin") {
    return p.toLowerCase();
  }
  return p;
}

/**
 * Assert that a variant-supplied relative path stays inside `root` after
 * resolution. Throws on absolute paths or any `..` traversal that escapes
 * `root`.
 *
 * Vendor variant JSON (`.agents/{agents,hooks}/variants/<vendor>.json`) is
 * read from the working project and is therefore attacker-controlled when a
 * developer clones a hostile repo and runs `oma link` / `install` / `update`.
 * Its path-bearing fields (`destDir`, `hookDir`, `settingsFile`,
 * `featureFlags.file`) are written verbatim through `join()`, which collapses
 * `..` — so a value like `../../../../tmp/evil` escapes the workspace and lets
 * the installer write arbitrary files. Callers MUST validate those fields with
 * this guard before any filesystem write.
 *
 * @returns the validated `relPath` (for convenient inline use).
 */
export function assertContainedRelPath(
  root: string,
  relPath: string,
  label: string,
): string {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new Error(`Refusing ${label}: path is empty or not a string.`);
  }
  if (isAbsolute(relPath)) {
    throw new Error(
      `Refusing ${label} with absolute path "${relPath}" — variant paths must be relative and stay inside the project.`,
    );
  }
  const resolvedRoot = resolve(root);
  const resolved = resolve(join(resolvedRoot, relPath));
  const normRoot = normalizeCaseForContainment(resolvedRoot);
  const normResolved = normalizeCaseForContainment(resolved);
  if (normResolved !== normRoot && !normResolved.startsWith(normRoot + sep)) {
    throw new Error(
      `Refusing ${label} "${relPath}" — resolves outside the project root.`,
    );
  }
  return relPath;
}
