import { spawn } from "node:child_process";
import color from "picocolors";
import { findChromeExecutable } from "../../io/chrome.js";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
  /** Required deps gate exit code 1; optional deps only disable subcommands. */
  required?: boolean;
  /** Subcommands that become unavailable when this dep is missing. */
  usedBy?: string;
}

async function checkBinary(
  bin: string,
  args: string[],
  hint?: string,
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("error", () =>
      resolve({
        name: bin,
        ok: false,
        detail: "not found",
        hint,
      }),
    );
    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve({
          name: bin,
          ok: true,
          detail: out.trim().split("\n")[0] ?? "",
        });
      } else {
        resolve({ name: bin, ok: false, detail: `exit code ${code}`, hint });
      }
    });
  });
}

async function checkNodeDep(pkgName: string): Promise<boolean> {
  try {
    await import(pkgName);
    return true;
  } catch {
    return false;
  }
}

export async function runSlideDoctor(): Promise<number> {
  const checks: CheckResult[] = [];

  // System Chrome / Chromium (required — every validate/export path needs it)
  const chromePath = findChromeExecutable();
  checks.push({
    name: "chrome",
    ok: Boolean(chromePath),
    detail: chromePath ?? "not found",
    required: true,
    usedBy: "validate, pdf, png, pptx, edit",
    hint: chromePath
      ? undefined
      : "Install Google Chrome, Chromium, or set OMA_CHROME_PATH",
  });

  // puppeteer-core (required — every validate/export path needs it)
  const puppeteerOk = await checkNodeDep("puppeteer-core");
  checks.push({
    name: "puppeteer-core",
    ok: puppeteerOk,
    detail: puppeteerOk ? "installed" : "not installed",
    required: true,
    usedBy: "validate, pdf, png, pptx, edit",
    hint: puppeteerOk ? undefined : "bun add puppeteer-core",
  });

  // yt-dlp (optional — needed only by fetch-video)
  const ytdlp = await checkBinary(
    "yt-dlp",
    ["--version"],
    "Install with: pip install yt-dlp  OR  brew install yt-dlp",
  );
  checks.push({ ...ytdlp, required: false, usedBy: "fetch-video" });

  // pptxgenjs (optional — needed only by pptx export)
  const pptxOk = await checkNodeDep("pptxgenjs");
  checks.push({
    name: "pptxgenjs",
    ok: pptxOk,
    detail: pptxOk ? "installed" : "not installed",
    required: false,
    usedBy: "pptx",
    hint: pptxOk ? undefined : "bun add --optional pptxgenjs",
  });

  // Print table
  const nameWidth = Math.max(...checks.map((c) => c.name.length)) + 2;
  console.log(color.bold("\noma slide doctor — dependency status\n"));

  for (const check of checks) {
    const mark = check.ok ? color.green("✓") : color.yellow("!");
    const name = check.name.padEnd(nameWidth);
    const optTag = check.required ? "" : color.dim(" (optional)");
    const detail = check.ok
      ? color.dim(check.detail)
      : color.yellow(check.detail);
    console.log(`  ${mark} ${name} ${detail}${optTag}`);
    if (!check.ok && check.hint) {
      console.log(`      ${color.cyan("→")} ${check.hint}`);
    }
  }

  const missing = checks.filter((c) => !c.ok);
  const missingRequired = missing.filter((c) => c.required);
  const missingOptional = missing.filter((c) => !c.required);

  console.log();
  if (missingRequired.length > 0) {
    console.log(
      color.yellow(
        `${missingRequired.length} required dependency(ies) missing — some subcommands will fail.`,
      ),
    );
    for (const check of missingRequired) {
      console.log(
        color.yellow(`  ${check.name} missing → unavailable: ${check.usedBy}`),
      );
    }
  }
  if (missingOptional.length > 0) {
    console.log(
      color.dim(
        `${missingOptional.length} optional dep(s) not installed — install when you need those subcommands.`,
      ),
    );
    for (const check of missingOptional) {
      console.log(
        color.dim(
          `  ${check.name} missing → unavailable: oma slide ${check.usedBy}`,
        ),
      );
    }
  }
  if (missing.length === 0) {
    console.log(color.green("All dependencies present."));
  }

  // Optional-only gaps exit 0 — only missing REQUIRED deps gate exit 1.
  return missingRequired.length > 0 ? 1 : 0;
}
