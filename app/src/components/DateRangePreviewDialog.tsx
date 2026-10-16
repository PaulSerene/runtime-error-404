"use client";

import { useEffect } from "react";
import {
  Calendar,
  Clock,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
  ArrowRight,
  Info,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { OverallDetectionResult } from "@/lib/dateDetector";

interface DateRangePreviewDialogProps {
  isOpen: boolean;
  result: OverallDetectionResult | null;
  currentTimezone: string;
  currentDates: { start: string; end: string };
  onApply: (appliedDates: { start: string; end: string }) => void;
  onCancel: () => void;
}

export function DateRangePreviewDialog({
  isOpen,
  result,
  currentTimezone,
  currentDates,
  onApply,
  onCancel,
}: DateRangePreviewDialogProps) {
  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || !result) return null;

  const {
    hasAnyValidTimestamps,
    overallEarliestDateInput,
    overallLatestDateInput,
    overallEarliestDisplay,
    overallLatestDisplay,
    overallEarliestIso,
    overallLatestIso,
    totalValid,
    totalInvalid,
    totalAmbiguous,
    fileReports,
    generalWarnings,
  } = result;

  const hasCurrentValues = Boolean(currentDates.start || currentDates.end);
  const willOverwrite =
    hasCurrentValues &&
    (currentDates.start !== overallEarliestDateInput ||
      currentDates.end !== overallLatestDateInput);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-[0_0_50px_rgba(6,182,212,0.15)] text-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dialog Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800 bg-slate-900/70">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Calendar className="h-4 w-4" />
              </div>
              <h2 id="preview-dialog-title" className="text-base font-bold text-white tracking-tight">
                Detected Telemetry Date Range
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Review timestamp boundaries and column detection across all uploaded CSV files
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Timezone alignment pill */}
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3.5 py-2 text-xs">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Globe className="h-3.5 w-3.5 text-cyan-400" /> Timezone Alignment:
            </span>
            <span className="font-mono font-semibold text-cyan-300">
              {currentTimezone}
            </span>
          </div>

          {/* Overall Detected Range Summary Card */}
          {hasAnyValidTimestamps ? (
            <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/30 via-slate-900/60 to-slate-900/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Calculated Baseline Calibration Window
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {totalValid.toLocaleString()} valid timestamps
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-cyan-400" /> Earliest Timestamp
                  </span>
                  <p className="text-sm font-bold font-mono text-white">
                    {overallEarliestDateInput}
                  </p>
                  <p className="text-[11px] text-slate-300 font-mono">
                    {overallEarliestDisplay}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono truncate" title={overallEarliestIso ?? ""}>
                    UTC: {overallEarliestIso}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-cyan-400" /> Latest Timestamp
                  </span>
                  <p className="text-sm font-bold font-mono text-white">
                    {overallLatestDateInput}
                  </p>
                  <p className="text-[11px] text-slate-300 font-mono">
                    {overallLatestDisplay}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono truncate" title={overallLatestIso ?? ""}>
                    UTC: {overallLatestIso}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-4 flex items-start gap-3 text-red-200">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-red-300">No Valid Timestamps Found</p>
                <p className="text-red-200/90 leading-relaxed">
                  None of the uploaded CSV files contain valid, parseable timestamps in recognized columns.
                  The range cannot be applied automatically. You must manually enter the Baseline Start and
                  Baseline End dates before proceeding with analysis.
                </p>
              </div>
            </div>
          )}

          {/* Overwrite Warning Banner */}
          {willOverwrite && hasAnyValidTimestamps && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3.5 flex items-start gap-2.5 text-xs text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">Existing Baseline Dates Will Be Overwritten</p>
                <p className="text-amber-200/90">
                  Applying this detected range will replace your currently entered dates:
                </p>
                <div className="flex items-center gap-2 pt-1 font-mono text-[11px]">
                  <span className="text-slate-400 line-through">
                    {currentDates.start || "(blank)"} → {currentDates.end || "(blank)"}
                  </span>
                  <ArrowRight className="h-3 w-3 text-amber-400" />
                  <span className="text-emerald-400 font-semibold">
                    {overallEarliestDateInput} → {overallLatestDateInput}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* General Warnings Section */}
          {(generalWarnings.length > 0 || totalInvalid > 0 || totalAmbiguous > 0) && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Timestamp Warnings & Ambiguities
              </h4>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs space-y-1.5 text-slate-300">
                {generalWarnings.map((w, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-amber-300/90">
                    <span className="text-amber-400">•</span> {w}
                  </p>
                ))}
                {totalInvalid > 0 && (
                  <p className="flex items-start gap-1.5 text-amber-300/90">
                    <span className="text-amber-400">•</span> {totalInvalid} invalid or unparseable row(s) were excluded from date calculation.
                  </p>
                )}
                {totalAmbiguous > 0 && (
                  <p className="flex items-start gap-1.5 text-cyan-300/90">
                    <span className="text-cyan-400">•</span> {totalAmbiguous} row(s) had ambiguous date formatting (day and month both ≤ 12).
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Breakdown Per Uploaded CSV File */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Inspection Breakdown Per File ({fileReports.length})
            </h4>

            <div className="space-y-2.5">
              {fileReports.map((file, idx) => {
                const isSuccess = file.status === "success";
                const isNoCol = file.status === "no_column";

                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3.5 space-y-2.5 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-cyan-400 shrink-0" />
                        <span className="font-semibold text-xs text-white truncate" title={file.fileName}>
                          {file.fileName}
                        </span>
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                          {file.roleLabel}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        {isSuccess ? (
                          <Badge variant="cyan" className="text-[10px] py-0.5">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Column: {file.timestampColumn}
                          </Badge>
                        ) : isNoCol ? (
                          <Badge variant="outline" className="text-[10px] py-0.5 border-slate-700 text-slate-400">
                            No Timestamp Column
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] py-0.5">
                            <XCircle className="h-3 w-3 mr-1" />
                            All Rows Unparseable
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Stats & Range Row */}
                    {isSuccess && file.earliestIso && file.latestIso ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] font-mono bg-slate-900/60 rounded-lg p-2.5 border border-slate-800/50">
                        <div>
                          <span className="text-slate-400">Earliest: </span>
                          <span className="text-white font-semibold">{file.earliestDisplay}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Latest: </span>
                          <span className="text-white font-semibold">{file.latestDisplay}</span>
                        </div>
                        <div className="sm:col-span-2 flex items-center gap-3 text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                          <span>Valid Rows: <strong className="text-emerald-400">{file.validCount}</strong></span>
                          <span>Invalid Rows: <strong className={file.invalidCount > 0 ? "text-red-400" : "text-slate-400"}>{file.invalidCount}</strong></span>
                          {file.ambiguousCount > 0 && (
                            <span>Ambiguous: <strong className="text-amber-400">{file.ambiguousCount}</strong></span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-900/40 p-2.5 text-xs text-slate-400 border border-slate-800/50">
                        {file.warnings.map((w, wIdx) => (
                          <p key={wIdx} className="leading-relaxed">
                            {w}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Dialog Action Buttons */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-800 bg-slate-900/90">
          <Button
            type="button"
            id="cancel-range-btn"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="border-slate-700 text-slate-300 hover:text-white"
          >
            Cancel
          </Button>

          <Button
            type="button"
            id="apply-range-btn"
            variant="default"
            size="sm"
            disabled={!hasAnyValidTimestamps}
            onClick={() => {
              if (hasAnyValidTimestamps) {
                onApply({
                  start: overallEarliestDateInput,
                  end: overallLatestDateInput,
                });
              }
            }}
            className={
              hasAnyValidTimestamps
                ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
            }
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Apply Range
          </Button>
        </div>
      </div>
    </div>
  );
}
