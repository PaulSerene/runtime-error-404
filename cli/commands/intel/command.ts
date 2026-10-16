import type { Command } from "commander";
import {
  addOutputOptions,
  resolveJsonMode,
  runAction,
} from "../../utils/cli-framework.js";
import { runIntelSuggest } from "./suggest.js";

type SuggestOptions = {
  config?: string;
  topic?: string;
  target?: string;
  repos?: string;
  since?: string;
  lastCommits?: string;
  outputDir?: string;
  dryRun?: boolean;
  fixture?: string;
  createIssue?: boolean;
  baseRepo?: string;
  yes?: boolean;
  json?: boolean;
  output?: string;
};

function printText(result: Awaited<ReturnType<typeof runIntelSuggest>>): void {
  console.log(result.gapReport);
  const paths = Object.values(result.outputPaths).filter(Boolean);
  if (paths.length > 0) {
    console.log("\nWritten:");
    for (const filePath of paths) {
      console.log(`- ${filePath}`);
    }
  }
  if (result.issue) {
    console.log(`\nIssue: ${result.issue.status} - ${result.issue.detail}`);
    if (result.issue.url) {
      console.log(`- ${result.issue.url}`);
    }
    if (result.issue.status === "dry-run" && result.issue.body) {
      console.log("\n--- issue preview ---");
      console.log(`# ${result.issue.title}\n`);
      console.log(result.issue.body);
    }
  }
}

async function runSuggest(options: SuggestOptions): Promise<void> {
  const result = await runIntelSuggest({
    config: options.config,
    topic: options.topic,
    target: options.target,
    repos: options.repos,
    since: options.since,
    lastCommits: options.lastCommits
      ? Number.parseInt(options.lastCommits, 10)
      : undefined,
    outputDir: options.outputDir,
    dryRun: options.dryRun,
    fixture: options.fixture,
    createIssue: options.createIssue,
    baseRepo: options.baseRepo,
    assumeYes: options.yes,
  });

  if (resolveJsonMode(options)) {
    console.log(
      JSON.stringify(
        {
          config: result.config,
          candidates: result.candidates,
          coverage: result.coverage,
          issue: result.issue,
          outputPaths: result.outputPaths,
        },
        null,
        2,
      ),
    );
  } else {
    printText(result);
  }
}

function addSuggestOptions(command: Command): Command {
  return addOutputOptions(
    command
      .option("--config <path>", "Path to oma intel YAML config")
      .option("--topic <topic>", "Market/product research topic")
      .option("--target <target>", "Target product or repository")
      .option(
        "--repos <repos>",
        "Comma-separated GitHub repos for one-off source input",
      )
      .option("--since <window>", "Time window such as 7d, 30d, 2w")
      .option("--last-commits <n>", "Analyze latest N commits per repo")
      .option("--output-dir <path>", "Local output directory")
      .option("--dry-run", "Print result without writing report files")
      .option(
        "--fixture <path>",
        "Load source signals from a local JSON fixture",
      )
      .option(
        "--create-issue",
        "File a GitHub issue with the accepted candidates (requires config + confirmation)",
      )
      .option(
        "--base-repo <owner/name>",
        "GitHub repo to file the issue in (defaults to target)",
      )
      .option(
        "--yes",
        "Approve issue creation non-interactively (use with --create-issue)",
      ),
  );
}

export function registerIntelCommand(program: Command): void {
  const intel = program
    .command("intel")
    .description(
      "Product intelligence pipeline: research, gaps, PRD, issue proposal",
    );

  addSuggestOptions(
    intel
      .command("suggest")
      .description(
        "Suggest high-value product work from market/code intelligence",
      ),
  ).action(
    runAction(
      async (_options, command) => {
        await runSuggest(command.opts() as SuggestOptions);
      },
      { supportsJsonOutput: true },
    ),
  );

  addSuggestOptions(
    intel
      .command("run")
      .description("Alias for suggest (kept for workflow-style usage)"),
  ).action(
    runAction(
      async (_options, command) => {
        await runSuggest(command.opts() as SuggestOptions);
      },
      { supportsJsonOutput: true },
    ),
  );
}
