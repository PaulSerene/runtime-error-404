import { readFileSync } from "node:fs";
import color from "picocolors";
import { loadVideoConfig } from "./config.js";
import { VideoOrchestrator } from "./orchestrator.js";
import type { ScriptInjector } from "./providers/script.js";
import { defaultVideoRegistry } from "./registry.js";
import { ScriptSchema } from "./types.js";

export interface RunVideoGenerateOptions {
  brief: string;
  opts: Record<string, unknown>;
}

/**
 * Load an agent-authored script.json (the "agent-as-key" injection path) when
 * `--script <path>` is given. Returns an injector that hands the parsed script
 * to the orchestrator, or throws a user-facing error on a missing/invalid file
 * so the caller can map it to exit code 4 (invalid-input).
 */
function loadScriptInjector(scriptPath: string): ScriptInjector {
  let raw: string;
  try {
    raw = readFileSync(scriptPath, "utf8");
  } catch {
    throw new Error(`--script file not found or unreadable: ${scriptPath}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`--script is not valid JSON: ${(err as Error).message}`);
  }
  const parsed = ScriptSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `--script does not match the script schema: ${first ? `${first.path.join(".")} — ${first.message}` : "validation failed"}`,
    );
  }
  return () => parsed.data;
}

export async function runVideoGenerate({
  brief,
  opts,
}: RunVideoGenerateOptions): Promise<number> {
  const config = await loadVideoConfig();
  let scriptInjector: ScriptInjector | undefined;
  if (typeof opts.script === "string" && opts.script.trim().length > 0) {
    try {
      scriptInjector = loadScriptInjector(opts.script.trim());
    } catch (err) {
      const message = (err as Error).message;
      if ((opts.format as string | undefined) === "json") {
        console.log(JSON.stringify({ exitCode: 4, error: message }));
      } else {
        console.error(color.red(message));
      }
      return 4;
    }
  }
  const registry = defaultVideoRegistry(config, {
    cwd: process.cwd(),
    scriptInjector,
  });
  const orchestrator = new VideoOrchestrator(config, registry);
  const result = await orchestrator.generate({ brief, opts });
  const formatMode = (opts.format as string | undefined) ?? "text";

  if (formatMode === "json") {
    console.log(
      JSON.stringify({
        exitCode: result.exitCode,
        runDir: result.runDir,
        manifestPath: result.manifestPath,
        scriptPath: result.scriptPath,
        renderSpecPath: result.renderSpecPath,
        warnings: result.warnings,
        error: result.error,
      }),
    );
  } else if (result.exitCode === 0) {
    console.error(color.green("oma video generate complete"));
    if (result.runDir) console.error(color.cyan(`  run: ${result.runDir}`));
    if (result.manifestPath) {
      console.error(color.cyan(`  manifest: ${result.manifestPath}`));
    }
    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.error(color.yellow(`  warning: ${warning}`));
      }
    }
  } else {
    console.error(color.red(result.error ?? "oma video generate failed"));
    if (result.manifestPath) {
      console.error(color.cyan(`  manifest: ${result.manifestPath}`));
    }
  }

  return result.exitCode;
}
