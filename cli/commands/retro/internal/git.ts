import { execFileSync, execSync } from "node:child_process";
import type { TimeWindow } from "../../../utils/time-window.js";
import type { RetroCommit, RetroFileChange } from "./types.js";

/**
 * Run a git command via execSync (shell string). Used only for safe, hard-coded
 * commands that contain no user/repo-supplied values (fetch, config reads).
 */
function execGitShell(cwd: string, cmd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Run git with an explicit argument array via execFileSync so no shell ever
 * interprets the arguments. Branch names, file paths, and other repo-sourced
 * values MUST go through this function, not execGitShell, because git ref names
 * can contain shell metacharacters ($, (), backtick, ;, |, &, etc.).
 */
function execGitArgs(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Validate a git branch / ref name against a strict allowlist.
 *
 * Git permits almost any byte sequence in ref names except NUL, space,
 * `..`, `@{`, control chars, and a few others — far too permissive for safe
 * shell interpolation. We restrict to the common-case safe charset (word chars,
 * dots, hyphens, slashes, and the leading `origin/` prefix) and fall back to
 * "main" for anything else. This is defence-in-depth on top of the execFileSync
 * switch: even if a caller accidentally uses execGitShell, the branch value
 * has already been validated.
 */
const SAFE_BRANCH_RE = /^[\w./-]+$/;

function validateBranch(branch: string): string {
  if (SAFE_BRANCH_RE.test(branch)) return branch;
  return "main";
}

export function fetchOrigin(cwd: string): void {
  // Hard-coded command, no user values — shell is fine here.
  execGitShell(cwd, "git fetch origin --quiet 2>/dev/null || true");
}

export function getDefaultBranch(cwd: string): string {
  // Use execFileSync so the piped shell commands are not needed.
  // `git symbolic-ref` prints the full ref (refs/remotes/origin/main); strip
  // the prefix in TypeScript rather than via a shell sed pipe.
  const fullRef = execGitArgs(cwd, [
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
  ]);
  const branch = fullRef
    ? fullRef.replace(/^refs\/remotes\/origin\//, "")
    : "main";
  // Validate before returning so callers that use the value in git commands
  // receive only safe tokens.
  return validateBranch(branch || "main");
}

export function getGitUserName(cwd: string): string {
  return execGitArgs(cwd, ["config", "user.name"]) || "Unknown";
}

export function getCommitsWithStats(
  cwd: string,
  window: TimeWindow,
  branch: string,
): RetroCommit[] {
  const safeBranch = validateBranch(branch);
  const args = [
    "log",
    safeBranch,
    `--since=${window.since}`,
    ...(window.until ? [`--until=${window.until}`] : []),
    "--format=COMMIT:%H|%aN|%ae|%at|%s",
    "--shortstat",
  ];
  const raw = execGitArgs(cwd, args);
  if (!raw) return [];

  const commits: RetroCommit[] = [];
  let current: Partial<RetroCommit> | null = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith("COMMIT:")) {
      if (current?.hash) {
        commits.push({
          hash: current.hash,
          author: current.author || "",
          email: current.email || "",
          timestamp: current.timestamp || 0,
          subject: current.subject || "",
          insertions: current.insertions || 0,
          deletions: current.deletions || 0,
        });
      }
      const parts = line.slice(7).split("|");
      current = {
        hash: parts[0],
        author: parts[1],
        email: parts[2],
        timestamp: Number.parseInt(parts[3] || "0", 10),
        subject: parts.slice(4).join("|"),
        insertions: 0,
        deletions: 0,
      };
    } else if (current && line.trim()) {
      const insMatch = line.match(/(\d+) insertions?\(\+\)/);
      const delMatch = line.match(/(\d+) deletions?\(-\)/);
      if (insMatch)
        current.insertions = Number.parseInt(insMatch[1] || "0", 10);
      if (delMatch) current.deletions = Number.parseInt(delMatch[1] || "0", 10);
    }
  }

  if (current?.hash) {
    commits.push({
      hash: current.hash,
      author: current.author || "",
      email: current.email || "",
      timestamp: current.timestamp || 0,
      subject: current.subject || "",
      insertions: current.insertions || 0,
      deletions: current.deletions || 0,
    });
  }

  return commits;
}

export function getFileChanges(
  cwd: string,
  window: TimeWindow,
  branch: string,
): RetroFileChange[] {
  const safeBranch = validateBranch(branch);
  const args = [
    "log",
    safeBranch,
    `--since=${window.since}`,
    ...(window.until ? [`--until=${window.until}`] : []),
    "--format=COMMIT:%H|%aN",
    "--numstat",
  ];
  const raw = execGitArgs(cwd, args);
  if (!raw) return [];

  const changes: RetroFileChange[] = [];
  let currentAuthor = "";

  for (const line of raw.split("\n")) {
    if (line.startsWith("COMMIT:")) {
      const parts = line.slice(7).split("|");
      currentAuthor = parts[1] || "";
    } else if (line.trim() && currentAuthor) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        const ins = Number.parseInt(parts[0] || "0", 10);
        const del = Number.parseInt(parts[1] || "0", 10);
        if (!Number.isNaN(ins) && !Number.isNaN(del) && parts[2]) {
          changes.push({
            file: parts[2],
            insertions: ins,
            deletions: del,
            author: currentAuthor,
          });
        }
      }
    }
  }

  return changes;
}

export function getFileHotspots(
  cwd: string,
  window: TimeWindow,
  branch: string,
  limit = 10,
): Array<{ file: string; count: number }> {
  const safeBranch = validateBranch(branch);
  // Run git with argv; do counting/sorting in TypeScript to avoid a shell pipe.
  const args = [
    "log",
    safeBranch,
    `--since=${window.since}`,
    ...(window.until ? [`--until=${window.until}`] : []),
    "--format=",
    "--name-only",
  ];
  const raw = execGitArgs(cwd, args);
  if (!raw) return [];

  // Count occurrences in TypeScript (replaces the shell: sort | uniq -c | sort -rn | head)
  const counts = new Map<string, number>();
  for (const line of raw.split("\n")) {
    const f = line.trim();
    if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([file, count]) => ({ file, count }));
}

export function getShippingStreak(
  cwd: string,
  branch: string,
  author?: string,
): number {
  const safeBranch = validateBranch(branch);
  const args = [
    "log",
    safeBranch,
    "--format=%ad",
    "--date=format-local:%Y-%m-%d",
    ...(author ? [`--author=${author}`] : []),
  ];
  const raw = execGitArgs(cwd, args);
  if (!raw) return 0;

  // Deduplicate and sort descending in TypeScript (replaces shell: sort -u)
  const dates = [...new Set(raw.split("\n").filter(Boolean))].sort().reverse();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  const checkDate = new Date(today);

  for (const dateStr of dates) {
    const [y = 0, m = 0, d = 0] = dateStr.split("-").map(Number);
    const commitDate = new Date(y, m - 1, d);
    commitDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round(
      (checkDate.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (diffDays === 1 && streak === 0) {
      streak++;
      checkDate.setTime(commitDate.getTime());
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

export function countAIAssistedCommits(
  cwd: string,
  window: TimeWindow,
  branch: string,
): number {
  const safeBranch = validateBranch(branch);
  const args = [
    "log",
    safeBranch,
    `--since=${window.since}`,
    ...(window.until ? [`--until=${window.until}`] : []),
    "--format=%b",
  ];
  const raw = execGitArgs(cwd, args);
  if (!raw) return 0;

  // Count AI co-author lines in TypeScript (replaces: grep -ci "..." || echo 0)
  const aiPattern =
    /co-authored-by.*noreply@anthropic\.com|co-authored-by.*copilot|co-authored-by.*openai/i;
  let count = 0;
  for (const line of raw.split("\n")) {
    if (aiPattern.test(line)) count++;
  }
  return count;
}
