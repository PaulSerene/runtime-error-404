"use client";

import { cn } from "@/lib/utils";
import type { IngestReport } from "@/types";
import {
  AlertTriangle,
  Copy,
  CheckCircle,
  Info,
  Check,
  FileCheck2,
  FileX2,
  Layers,
  Search,
} from "lucide-react";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface Props {
  report: IngestReport;
}

export function IngestPanel({ report }: Props) {
  const [filterQuery, setFilterQuery] = useState("");
  const [copiedRow, setCopiedRow] = useState<string | null>(null);

  const missingFields = Object.entries(report.missingFieldCounts);
  const validRate = report.totalRows > 0 ? (report.validRows / report.totalRows) * 100 : 100;

  const genuineInvalid = report.invalidRows.filter((r) => !r.reason.startsWith("skipped: "));
  const ruleSkips = report.invalidRows.filter((r) => r.reason.startsWith("skipped: "));

  const filteredInvalid = report.invalidRows.filter((r) =>
    r.row.toLowerCase().includes(filterQuery.toLowerCase()) ||
    r.reason.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const copyRow = (rowText: string) => {
    navigator.clipboard.writeText(rowText);
    setCopiedRow(rowText);
    setTimeout(() => setCopiedRow(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Rows Read</span>
            <Layers className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-extrabold font-mono text-white tabular-nums">
            {report.totalRows.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-500 font-mono mt-1">Raw telemetry stream</p>
        </Card>

        <Card className="p-4 border-emerald-500/30 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Valid Ingested Rows</span>
            <FileCheck2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 tabular-nums">
            {report.validRows.toLocaleString()}
          </p>
          <p className="text-[10px] text-emerald-400/70 font-mono mt-1">
            {validRate.toFixed(1)}% integrity rate
          </p>
        </Card>

        <Card className="p-4 border-red-500/30 bg-red-950/20 shadow-[0_0_15px_rgba(239,68,68,0.05)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-300">Rejected Rows</span>
            <FileX2 className="h-4 w-4 text-red-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-extrabold font-mono text-red-400 tabular-nums">
            {genuineInvalid.length}
          </p>
          <p className="text-[10px] text-red-400/70 font-mono mt-1">
            Timestamp / format issues
          </p>
        </Card>

        <Card className="p-4 border-amber-500/30 bg-amber-950/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">Duplicates Pruned</span>
            <Copy className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-extrabold font-mono text-amber-400 tabular-nums">
            {report.duplicatesRemoved}
          </p>
          <p className="text-[10px] text-amber-400/70 font-mono mt-1">FNV-1a hash deduplication</p>
        </Card>
      </div>

      {/* Ingestion Health Progress Bar */}
      <Card className="border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-white flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-cyan-400" />
            Telemetry Data Cleansing & Ingest Integrity
          </span>
          <span className="text-cyan-400 font-mono">{validRate.toFixed(1)}% Clean</span>
        </div>
        <Progress
          value={validRate}
          className="h-2.5"
          indicatorClassName={cn(
            validRate >= 95
              ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
              : validRate >= 80
              ? "bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]"
              : "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
          )}
        />
      </Card>

      {/* Missing Columns & Rule Skips Notice */}
      {ruleSkips.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-950/15 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Rules Skipped Due to Missing Optional Columns ({ruleSkips.length})
          </h3>
          <p className="text-xs text-amber-200/80 mb-3">
            The dataset lacks specific optional fields. The engine skipped these rules safely without throwing:
          </p>
          <div className="flex flex-wrap gap-2">
            {ruleSkips.map((s, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1 font-mono text-xs text-amber-200"
              >
                <span className="font-bold text-amber-300">{s.row}:</span>
                <span>{s.reason}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Missing Field Warnings */}
      {missingFields.length > 0 && (
        <Card className="border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-cyan-400" />
            Missing Field Population Frequency
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {missingFields.map(([field, count]) => (
              <div
                key={field}
                className="flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-800/60 px-3 py-1.5"
              >
                <span className="font-mono text-xs text-cyan-300">{field}</span>
                <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-300">
                  {count} rows
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Invalid Rows Table */}
      {genuineInvalid.length > 0 && (
        <Card className="border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <FileX2 className="h-4 w-4" />
              Rejected Log Rows Inspection ({genuineInvalid.length})
            </h3>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter rejected rows..."
                className="h-8 w-full rounded-lg border border-slate-700 bg-slate-900 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="p-4 pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Raw Log Row Content</TableHead>
                  <TableHead>Rejection Reason</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvalid.slice(0, 15).map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs text-slate-500">{idx + 1}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-300 max-w-md truncate">
                      {row.row}
                    </TableCell>
                    <TableCell className="text-xs text-red-300 font-medium">
                      {row.reason}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => copyRow(row.row)}
                        title="Copy raw row"
                        className="text-slate-400 hover:text-white"
                      >
                        {copiedRow === row.row ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredInvalid.length > 15 && (
              <p className="text-[11px] font-mono text-slate-500 text-center pt-3">
                Showing 15 of {filteredInvalid.length} rejected rows
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
