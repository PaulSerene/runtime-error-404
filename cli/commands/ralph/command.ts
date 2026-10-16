import type { Command } from "commander";
import { verifyRalphExecArtifacts } from "../../state/artifact-verifier.js";
import {
  addOutputOptions,
  resolveJsonMode,
  runAction,
} from "../../utils/cli-framework.js";
import { resolveProjectRoot } from "../../utils/fs-utils.js";

export function registerRalph(program: Command): void {
  addOutputOptions(
    program
      .command("ralph:verify")
      .description(
        "Verify ralph EXEC artifacts (anti-circumvention gate, ralph.md Step 1.3)",
      )
      .option(
        "--session <id>",
        "Session id suffix used in plan/result artifact filenames",
      )
      .option(
        "--newer-than <iso>",
        "Only count artifacts modified at or after this ISO-8601 timestamp",
      )
      .option(
        "--no-emit",
        "Do not append a gate.failed L1 event when verification fails",
      ),
  ).action(
    runAction(
      async (options) => {
        const jsonMode = resolveJsonMode(options);
        const result = await verifyRalphExecArtifacts({
          projectDir: resolveProjectRoot(),
          sid: options.session as string | undefined,
          newerThan: options.newerThan as string | undefined,
          emitOnFail: options.emit !== false,
        });

        if (jsonMode) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.ok) {
          console.log(
            `EXEC artifacts present (${result.checks.length} checks) — ultrawork ran in full.`,
          );
          for (const check of result.checks) {
            console.log(`  [${check.status}] ${check.id}: ${check.pattern}`);
          }
        } else {
          console.error(
            "EXEC artifact gate FAILED — ultrawork did not run in full:",
          );
          for (const check of result.missing) {
            console.error(
              `  - ${check.id}: ${check.description} (expected ${check.pattern})`,
            );
          }
          if (result.remediation) {
            console.error(`  remediation: ${result.remediation}`);
          }
        }

        if (!result.ok) {
          process.exitCode = 1;
        }
      },
      { supportsJsonOutput: true },
    ),
  );
}
