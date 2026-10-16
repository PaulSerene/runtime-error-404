import type { Command } from "commander";
import {
  addOutputOptions,
  resolveJsonMode,
  runAction,
} from "../../utils/cli-framework.js";
import { checkAuthStatus } from "./check.js";

export { checkAuthStatus } from "./check.js";

export function registerAuthStatus(program: Command): void {
  addOutputOptions(
    program
      .command("auth:status")
      .description("Check authentication status of all supported CLIs"),
  ).action(
    runAction(
      async (options) => {
        await checkAuthStatus(resolveJsonMode(options));
      },
      { supportsJsonOutput: true },
    ),
  );
}
