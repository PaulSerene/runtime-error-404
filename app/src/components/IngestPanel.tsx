"use client";

import { cn } from "cn";
import type { IngestReport } from "@/types";
import { AlertTriangle, Copy, CheckCircle, Info } from "lucide-react";

interface Props {
  report: IngestReport;
}

export function IngestPanel({ report }: Props) {
  const missingFields = Object.entries(report.missingFieldCounts);
  const hasIssues =
    report.invalidRows.length > 0 ||
    report.duplicatesRemoved > 0 ||
    missingFields.length > 0;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-6">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-300">
        <Info className="h-4 w-4 text-blue-400" />
        Ingest Quality Report
      </h2>

      {/* Summary row */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total rows", value: report.totalRows, color: "text-white" },
          { label: "Valid rows", value: report.validRows, color: "text-emerald-400" },
          {
            label: "Invalid rows",
            value: report.invalidRows.length,
            color: report.invalidRows.length > 0 ? "text-red-400" : "text-emerald-400",
          },
          {
            label: "Duplicates removed",
            value: report.duplicatesRemoved,
            color: report.duplicatesRemoved > 0 ? "text-amber-400" : "text-emerald-400",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-lg border border-slate-700/40 bg-slate-800/40 p-3 text-center"
          >
            <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
            <div className="mt-0.5 text-[0.65rem] uppercase tracking-wider text-slate-400">
              {label}
            </div>
          </div>
        ))}
      </div>

      {!hasIssues ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle className="h-4 w-4" />
          All rows parsed cleanly — no quality issues detected.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Invalid rows */}
          {report.invalidRows.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Invalid Rows ({report.invalidRows.length})
              </h3>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 divide-y divide-red-500/10">
                {report.invalidRows.map((row) => (
                  <div key={row.row} className="flex items-center gap-3 px-4 py-2">
                    <Copy className="h-3 w-3 shrink-0 text-red-400/60" />
                    <span className="font-mono text-xs text-slate-400">{row.row}</span>
                    <span className="ml-auto text-xs text-red-300">{row.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing fields */}
          {missingFields.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Missing Field Warnings
              </h3>
              <div className="flex flex-wrap gap-2">
                {missingFields.map(([field, count]) => (
                  <div
                    key={field}
                    className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1"
                  >
                    <span className="font-mono text-xs text-amber-300">{field}</span>
                    <span className="rounded-full bg-amber-500/20 px-1.5 text-[0.65rem] font-bold text-amber-400">
                      {count} rows
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Duplicates note */}
          {report.duplicatesRemoved > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-blue-300">
              <Info className="h-4 w-4 shrink-0 text-blue-400" />
              <span>
                <strong className="font-semibold">{report.duplicatesRemoved} duplicate rows</strong>{" "}
                were identified (by content hash) and removed before analysis.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
