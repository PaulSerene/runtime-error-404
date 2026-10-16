/**
 * Batch scanner CLI for Windows Security log CSVs.
 *
 * Usage:
 *   npm run scan -- ./datasets
 *   npm run scan -- <folder_path>
 *
 * Processes every CSV file in the specified directory:
 * - Ingests and normalizes the log events
 * - Applies detection rules and required-field guards
 * - Scores and groups into incidents
 * - Prints per-file metrics (rows read, rows rejected, column mapping, rules run/skipped, alerts per rule)
 * - Writes aggregated results to output/summary.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "@/engine/index";
import { checkRequiredFields } from "@/engine/rules/guards";
import { resolveColumnMap } from "@/engine/ingest/columnMapper";
import type { Config } from "@/types";

const ALL_RULES = [
  "RULE-BRUTE-FORCE",
  "RULE-FAILURE-THEN-SUCCESS",
  "RULE-PASSWORD-SPRAY",
  "RULE-OFF-HOURS",
  "RULE-NEW-SOURCE-IP",
  "RULE-LATERAL-MOVEMENT",
] as const;

interface FileScanResult {
  file: string;
  filePath: string;
  rowsRead: number;
  rowsRejected: number;
  duplicatesRemoved: number;
  validRows: number;
  columnMapping: Record<string, string>;
  rulesRun: string[];
  rulesSkipped: Array<{ ruleId: string; reason: string }>;
  alertsPerRule: Record<string, number>;
  totalAlerts: number;
  totalIncidents: number;
}

interface ScanSummary {
  scannedAt: string;
  datasetDir: string;
  totalFiles: number;
  files: FileScanResult[];
}

function getDefaultConfig(): Config {
  return {
    thresholds: {},
    trainingPeriod: {
      start: "1970-01-01T00:00:00Z",
      end: "1970-01-01T00:00:00Z",
    },
    timezone: "UTC",
    maintenanceWindows: [],
    approvedAccounts: [],
    vpnCidrs: [],
    assets: [],
    privilegedAccounts: [],
    ipLocations: [],
  };
}

function loadCustomConfig(csvFilePath: string, folderPath: string): Config {
  const baseConfig = getDefaultConfig();

  // Try file-specific config: <name>.config.json
  const fileSpecific = csvFilePath.replace(/\.csv$/i, ".config.json");
  if (fs.existsSync(fileSpecific)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(fileSpecific, "utf-8"));
      return { ...baseConfig, ...parsed, thresholds: { ...baseConfig.thresholds, ...parsed.thresholds } };
    } catch {
      // ignore parse error, fallback
    }
  }

  // Try directory-wide config: config.json in the same folder
  const dirConfig = path.join(folderPath, "config.json");
  if (fs.existsSync(dirConfig)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(dirConfig, "utf-8"));
      return { ...baseConfig, ...parsed, thresholds: { ...baseConfig.thresholds, ...parsed.thresholds } };
    } catch {
      // ignore parse error, fallback
    }
  }

  return baseConfig;
}

export function scanFolder(folderArg?: string): ScanSummary {
  const targetDir = path.resolve(process.cwd(), folderArg || "./datasets");

  console.log("============================================================");
  console.log(`Scanning directory: ${targetDir}`);

  if (!fs.existsSync(targetDir)) {
    console.warn(`[WARN] Directory does not exist: ${targetDir}`);
    const emptySummary: ScanSummary = {
      scannedAt: new Date().toISOString(),
      datasetDir: targetDir,
      totalFiles: 0,
      files: [],
    };
    writeSummary(emptySummary);
    return emptySummary;
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const csvFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".csv"))
    .map((e) => e.name)
    .sort();

  console.log(`Found ${csvFiles.length} CSV file(s)`);
  console.log("============================================================\n");

  const results: FileScanResult[] = [];

  for (let idx = 0; idx < csvFiles.length; idx++) {
    const fileName = csvFiles[idx];
    const fullPath = path.join(targetDir, fileName);
    const csvContent = fs.readFileSync(fullPath, "utf-8");
    const config = loadCustomConfig(fullPath, targetDir);

    const analysis = analyze(csvContent, config);

    // Identify genuine invalid rows vs rule skips
    const skippedRules: Array<{ ruleId: string; reason: string }> = [];
    let genuineRejectedRows = 0;

    for (const inv of analysis.ingestReport.invalidRows) {
      if (inv.reason.startsWith("skipped: ")) {
        skippedRules.push({ ruleId: inv.row, reason: inv.reason });
      } else {
        genuineRejectedRows++;
      }
    }

    // Double-check checkRequiredFields directly for any rules not already caught
    for (const ruleId of ALL_RULES) {
      if (!skippedRules.some((s) => s.ruleId === ruleId)) {
        const skip = checkRequiredFields(ruleId, analysis.events);
        if (skip) {
          skippedRules.push(skip);
        }
      }
    }

    const skippedRuleIds = new Set(skippedRules.map((s) => s.ruleId));
    const rulesRun = ALL_RULES.filter((r) => !skippedRuleIds.has(r));

    const alertsPerRule: Record<string, number> = {};
    for (const r of ALL_RULES) {
      alertsPerRule[r] = 0;
    }
    for (const alert of analysis.alerts) {
      alertsPerRule[alert.ruleId] = (alertsPerRule[alert.ruleId] ?? 0) + 1;
    }

    // Resolve column mapping from the CSV header line
    const firstLine = csvContent.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
    const headers = firstLine.split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
    const { fieldToColumn } = resolveColumnMap(headers, { silent: true });
    const columnMapping: Record<string, string> = {};
    for (const [canon, rawCol] of fieldToColumn.entries()) {
      columnMapping[canon] = rawCol;
    }

    const fileResult: FileScanResult = {
      file: fileName,
      filePath: fullPath,
      rowsRead: analysis.ingestReport.totalRows,
      rowsRejected: genuineRejectedRows,
      duplicatesRemoved: analysis.ingestReport.duplicatesRemoved,
      validRows: analysis.ingestReport.validRows,
      columnMapping,
      rulesRun,
      rulesSkipped: skippedRules,
      alertsPerRule,
      totalAlerts: analysis.alerts.length,
      totalIncidents: analysis.incidents.length,
    };

    results.push(fileResult);

    // Formatted console output per file
    console.log(`[File ${idx + 1}/${csvFiles.length}] ${fileName}`);
    console.log(`  Rows read:            ${fileResult.rowsRead}`);
    console.log(`  Rows rejected:        ${fileResult.rowsRejected}`);
    console.log(`  Duplicates removed:   ${fileResult.duplicatesRemoved}`);
    console.log(`  Valid rows:           ${fileResult.validRows}`);
    
    const colEntries = Object.entries(columnMapping)
      .map(([canon, src]) => `${canon} -> ${src}`)
      .join(", ");
    console.log(`  Column mapping used:  ${colEntries || "none"}`);

    console.log(`  Rules run:            ${rulesRun.join(", ") || "none"}`);
    if (skippedRules.length > 0) {
      const skipStr = skippedRules.map((s) => `${s.ruleId} (${s.reason})`).join(", ");
      console.log(`  Rules skipped:        ${skipStr}`);
    } else {
      console.log(`  Rules skipped:        none`);
    }

    console.log(`  Alerts per rule:`);
    for (const [r, count] of Object.entries(alertsPerRule)) {
      console.log(`    - ${r.padEnd(26)}: ${count}`);
    }
    console.log(`  Total alerts:         ${fileResult.totalAlerts}`);
    console.log(`  Total incidents:      ${fileResult.totalIncidents}`);
    console.log("------------------------------------------------------------\n");
  }

  const summary: ScanSummary = {
    scannedAt: new Date().toISOString(),
    datasetDir: targetDir,
    totalFiles: results.length,
    files: results,
  };

  writeSummary(summary);
  return summary;
}

function writeSummary(summary: ScanSummary) {
  const outputDir = path.resolve(process.cwd(), "./output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "summary.json");
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`Summary written to: ${outputPath}`);
}

// Execute when invoked directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("scan.ts")) {
  const targetArg = process.argv[2];
  scanFolder(targetArg);
}
