/**
 * Recommended global git settings for multi-agent workflows.
 *
 * Applied only with explicit interactive consent (never silent --global writes
 * in CI / --yes). install, update, and doctor share this module.
 */
import { execFileSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";

export type RecommendedGitKey = "rerere.enabled" | "init.defaultBranch";

export interface RecommendedGitItem {
  key: RecommendedGitKey;
  desired: string;
  /** Current effective value, or null if unset / unreadable. */
  current: string | null;
  ok: boolean;
  /** Confirm prompt when the value needs fixing. */
  promptMessage: string;
  /** One-line fix hint for non-interactive / declined paths. */
  fixHint: string;
}

export interface RecommendedGitConfigStatus {
  /** False when `git` is missing or `git config` cannot run. */
  available: boolean;
  items: RecommendedGitItem[];
  allOk: boolean;
  /** Count of items that are missing or wrong (for doctor issue totals). */
  issueCount: number;
}

const RECOMMENDED: ReadonlyArray<{
  key: RecommendedGitKey;
  desired: string;
  promptMessage: string;
}> = [
  {
    key: "rerere.enabled",
    desired: "true",
    promptMessage:
      "Enable git rerere? (Recommended for multi-agent merge conflict reuse)",
  },
  {
    key: "init.defaultBranch",
    desired: "main",
    promptMessage:
      "Set git init.defaultBranch to main? (Recommended global default)",
  },
];

export function getGitConfig(key: string): string | null {
  try {
    const value = execFileSync("git", ["config", "--get", key], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setGitConfigGlobal(key: string, value: string): void {
  execFileSync("git", ["config", "--global", key, value], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** True when the `git` binary is callable. */
export function isGitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

export function inspectRecommendedGitConfig(): RecommendedGitConfigStatus {
  if (!isGitAvailable()) {
    return {
      available: false,
      items: [],
      allOk: false,
      issueCount: 0,
    };
  }

  const items: RecommendedGitItem[] = RECOMMENDED.map((spec) => {
    const current = getGitConfig(spec.key);
    const ok = current === spec.desired;
    return {
      key: spec.key,
      desired: spec.desired,
      current,
      ok,
      promptMessage: spec.promptMessage,
      fixHint: `git config --global ${spec.key} ${spec.desired}`,
    };
  });

  const issueCount = items.filter((item) => !item.ok).length;
  return {
    available: true,
    items,
    allOk: issueCount === 0,
    issueCount,
  };
}

export type ApplyRecommendedGitConfigOptions = {
  /**
   * When true (CI / --yes), never write global git config; only report.
   * HOME-level mutations stay interactive opt-in.
   */
  nonInteractive?: boolean;
};

export type ApplyRecommendedGitConfigResult = {
  available: boolean;
  applied: RecommendedGitKey[];
  skipped: RecommendedGitKey[];
  alreadyOk: RecommendedGitKey[];
};

/**
 * Check recommended global git settings and optionally apply them after confirm.
 * Safe no-op when git is unavailable.
 */
export async function maybeApplyRecommendedGitConfig(
  options: ApplyRecommendedGitConfigOptions = {},
): Promise<ApplyRecommendedGitConfigResult> {
  const nonInteractive = options.nonInteractive === true;
  const status = inspectRecommendedGitConfig();

  if (!status.available) {
    p.log.info(pc.dim("Git not available — skipped recommended git config."));
    return { available: false, applied: [], skipped: [], alreadyOk: [] };
  }

  const alreadyOk = status.items.filter((i) => i.ok).map((i) => i.key);
  const pending = status.items.filter((i) => !i.ok);

  if (pending.length === 0) {
    p.log.success(
      pc.green(
        "Recommended git config OK (rerere.enabled, init.defaultBranch).",
      ),
    );
    return { available: true, applied: [], skipped: [], alreadyOk };
  }

  if (nonInteractive) {
    const hints = pending.map((item) => item.fixHint).join("; ");
    p.log.info(
      pc.dim(
        `Skipped recommended git config (${pending.map((i) => i.key).join(", ")}). Run interactively or: ${hints}`,
      ),
    );
    return {
      available: true,
      applied: [],
      skipped: pending.map((i) => i.key),
      alreadyOk,
    };
  }

  const applied: RecommendedGitKey[] = [];
  const skipped: RecommendedGitKey[] = [];

  for (const item of pending) {
    const currentHint =
      item.current === null
        ? "unset"
        : `currently ${JSON.stringify(item.current)}`;
    const shouldEnable = await p.confirm({
      message: `${item.promptMessage} (${currentHint})`,
      initialValue: true,
    });

    if (p.isCancel(shouldEnable) || !shouldEnable) {
      skipped.push(item.key);
      p.log.info(pc.dim(`Skipped ${item.key}. Fix later: ${item.fixHint}`));
      continue;
    }

    try {
      setGitConfigGlobal(item.key, item.desired);
      applied.push(item.key);
      p.log.success(
        pc.green(`Set git config --global ${item.key} ${item.desired}`),
      );
    } catch (err) {
      skipped.push(item.key);
      p.log.error(
        `Failed to set ${item.key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { available: true, applied, skipped, alreadyOk };
}
