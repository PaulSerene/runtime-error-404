"use client";

import { useState } from "react";
import { cn } from "cn";
import type { AnalysisResult } from "@/types";
import { StatCard } from "@/components/StatCard";
import { FilterBar } from "@/components/FilterBar";
import { IncidentList } from "@/components/IncidentList";
import { IncidentDetail } from "@/components/IncidentDetail";
import { IngestPanel } from "@/components/IngestPanel";
import {
  AlertTriangle,
  Shield,
  Activity,
  FileWarning,
  Copy,
  ArrowLeft,
  LayoutDashboard,
  DatabaseZap,
  Sun,
  Moon,
} from "lucide-react";

interface Props {
  result: AnalysisResult;
  onBack: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

type Tab = "dashboard" | "ingest";

export function ResultsDashboard({ result, onBack, darkMode, onToggleDark }: Props) {
  const [filters, setFilters] = useState({ user: "", host: "", rule: "", severity: "" });
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");

  const { incidents, events, ingestReport } = result;

  const severityCount = (s: string) => incidents.filter((i) => i.severity === s).length;

  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId) ?? null;

  return (
    <div className={cn("flex min-h-screen flex-col bg-slate-950 text-slate-100", darkMode ? "dark" : "")}>
      {/* Top nav */}
      <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-slate-700/50 bg-slate-950/90 px-6 py-3 backdrop-blur">
        <button
          id="back-to-upload"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-xs font-medium">Upload</span>
        </button>

        <div className="flex-1 flex items-center gap-1">
          <div className="flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-3 py-1">
            <Shield className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs font-bold text-blue-300 tracking-wide">
              Log Analyser
            </span>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-700/50 bg-slate-800/50 p-1">
          <button
            id="tab-dashboard"
            onClick={() => setTab("dashboard")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              tab === "dashboard"
                ? "bg-slate-700 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dashboard
          </button>
          <button
            id="tab-ingest"
            onClick={() => setTab("ingest")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              tab === "ingest"
                ? "bg-slate-700 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            <DatabaseZap className="h-3.5 w-3.5" />
            Ingest Quality
            {ingestReport.invalidRows.length > 0 && (
              <span className="rounded-full bg-red-500/30 px-1.5 text-[0.6rem] font-bold text-red-400">
                {ingestReport.invalidRows.length}
              </span>
            )}
          </button>
        </div>

        <button
          id="toggle-dark-mode"
          onClick={onToggleDark}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          title="Toggle dark/light mode"
        >
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      {tab === "ingest" ? (
        /* ─── Ingest Quality Tab ─── */
        <main className="flex-1 px-6 py-6">
          <IngestPanel report={ingestReport} />
        </main>
      ) : (
        /* ─── Dashboard Tab ─── */
        <main className="flex-1 px-6 py-6">
          {/* Summary cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              title="Total Events"
              value={events.length.toLocaleString()}
              icon={<Activity className="h-4 w-4" />}
              accent="default"
              className="col-span-1"
            />
            <StatCard
              title="Incidents"
              value={incidents.length}
              icon={<Shield className="h-4 w-4" />}
              accent="blue"
            />
            <StatCard
              title="Critical"
              value={severityCount("critical")}
              icon={<AlertTriangle className="h-4 w-4" />}
              accent="red"
            />
            <StatCard
              title="High"
              value={severityCount("high")}
              icon={<AlertTriangle className="h-4 w-4" />}
              accent="orange"
            />
            <StatCard
              title="Invalid Rows"
              value={ingestReport.invalidRows.length}
              sub={`of ${ingestReport.totalRows.toLocaleString()} total`}
              icon={<FileWarning className="h-4 w-4" />}
              accent={ingestReport.invalidRows.length > 0 ? "yellow" : "green"}
            />
            <StatCard
              title="Duplicates Removed"
              value={ingestReport.duplicatesRemoved}
              icon={<Copy className="h-4 w-4" />}
              accent="default"
            />
          </div>

          {/* Config strip */}
          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/40 bg-slate-900/50 px-4 py-2.5 text-[0.65rem]">
            <span className="font-semibold uppercase tracking-wider text-slate-500">Config:</span>
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">
              tz: {result.config.timezone}
            </span>
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">
              training: {result.config.trainingPeriod.start.slice(0, 10)} →{" "}
              {result.config.trainingPeriod.end.slice(0, 10)}
            </span>
            {result.config.approvedAccounts.map((a) => (
              <span key={a} className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-400">
                ✓ {a}
              </span>
            ))}
          </div>

          {/* Filters */}
          <div className="mb-5">
            <FilterBar filters={filters} onChange={setFilters} />
          </div>

          {/* Content: list + detail panel */}
          <div
            className={cn(
              "grid gap-5",
              selectedIncident
                ? "grid-cols-1 lg:grid-cols-[1fr_1.4fr]"
                : "grid-cols-1 max-w-3xl"
            )}
          >
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                <Shield className="h-3.5 w-3.5 text-blue-400" />
                Incidents — sorted by risk score
              </h2>
              <IncidentList
                incidents={incidents}
                events={events}
                selectedId={selectedIncidentId}
                onSelect={setSelectedIncidentId}
                filters={filters}
              />
            </section>

            {selectedIncident && (
              <section className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-hidden">
                <IncidentDetail
                  incident={selectedIncident}
                  events={events}
                  onClose={() => setSelectedIncidentId(null)}
                />
              </section>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
