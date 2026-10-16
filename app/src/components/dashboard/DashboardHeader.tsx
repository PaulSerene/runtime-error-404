"use client";

import { cn } from "@/lib/utils";
import {
  Shield,
  ShieldAlert,
  Sun,
  Moon,
  Download,
  FileCode2,
  ArrowLeft,
  Search,
  Bell,
  Radio,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportCsv, exportHtmlReport } from "@/lib/exports";
import type { AnalysisResult } from "@/types";
import type { DashboardView } from "./AppSidebar";

interface Props {
  result: AnalysisResult;
  currentView: DashboardView;
  onSelectView: (v: DashboardView) => void;
  onBackToUpload: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  onToggleSidebar?: () => void;
}

const VIEW_TITLES: Record<DashboardView, { title: string; subtitle: string }> = {
  overview: {
    title: "SOC Telemetry Overview",
    subtitle: "Real-time threat landscape, incident severity metrics & telemetry breakdown",
  },
  incidents: {
    title: "Incident Triage & Correlation",
    subtitle: "Correlated alert chains, risk scores, and evidence forensic analysis",
  },
  ingest: {
    title: "Ingest Quality & Parser Health",
    subtitle: "Telemetry integrity, duplicate suppression & rejection diagnostics",
  },
  rules: {
    title: "Detection Rules & Coverage Matrix",
    subtitle: "Active behavioral correlation rules, guard coverage & threshold parameters",
  },
  upload: {
    title: "Log Ingestion & Configuration",
    subtitle: "Upload Windows Event Logs, Assets & Geolocation mapping",
  },
};

export function DashboardHeader({
  result,
  currentView,
  onSelectView,
  onBackToUpload,
  darkMode,
  onToggleDark,
  onToggleSidebar,
}: Props) {
  const { incidents, ingestReport } = result;
  const criticalCount = incidents.filter((i) => i.severity === "critical").length;
  const viewInfo = VIEW_TITLES[currentView] ?? VIEW_TITLES.overview;

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-4 sm:px-6 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <button
          id="back-to-upload"
          type="button"
          onClick={onBackToUpload}
          className="flex items-center gap-1.5 rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 hover:bg-slate-800/80 transition-all shadow-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Upload</span>
        </button>

        {/* Breadcrumbs */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-500">
          <span>SOC</span>
          <span>/</span>
          <span>DETECTOR</span>
          <span>/</span>
          <span className="text-cyan-300 font-semibold uppercase">{currentView}</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {/* Threat Pill */}
        <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1">
          <span className="relative flex h-2 w-2">
            <span className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
              criticalCount > 0 ? "bg-red-400" : "bg-cyan-400"
            )} />
            <span className={cn(
              "relative inline-flex rounded-full h-2 w-2",
              criticalCount > 0 ? "bg-red-500" : "bg-cyan-500"
            )} />
          </span>
          <span className="text-[11px] font-mono text-slate-300 font-medium">
            {ingestReport.validRows.toLocaleString()} rows • {incidents.length} incidents
          </span>
        </div>

        {/* Export Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            id="export-csv-btn"
            variant="outline"
            size="xs"
            onClick={() => exportCsv(result)}
            className="border-slate-800 bg-slate-900/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
            title="Export Incidents CSV"
          >
            <Download className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">CSV</span>
          </Button>

          <Button
            id="export-html-btn"
            variant="outline"
            size="xs"
            onClick={() => exportHtmlReport(result)}
            className="border-slate-800 bg-slate-900/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
            title="Download Executive HTML Report"
          >
            <FileCode2 className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Report</span>
          </Button>
        </div>

        {/* Theme toggle */}
        <Button
          id="toggle-dark-mode"
          variant="ghost"
          size="icon-xs"
          onClick={onToggleDark}
          className="text-slate-400 hover:text-white hover:bg-slate-800"
          title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {darkMode ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
