"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AnalysisResult } from "@/types";
import { FilterBar } from "@/components/FilterBar";
import { IncidentList } from "@/components/IncidentList";
import { IncidentDetail } from "@/components/IncidentDetail";
import { IngestPanel } from "@/components/IngestPanel";
import { AppSidebar, type DashboardView } from "@/components/dashboard/AppSidebar";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { OverviewView } from "@/components/dashboard/OverviewView";
import { RulesView } from "@/components/dashboard/RulesView";
import { Shield, ShieldCheck } from "lucide-react";

interface Props {
  result: AnalysisResult;
  onBack: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

// Heuristic: if all events fall outside the training window, baseline rules can't learn.
function noBaselineWarning(result: AnalysisResult): boolean {
  const { events, config } = result;
  if (events.length === 0) return false;
  const tStart = new Date(config.trainingPeriod.start).getTime();
  const tEnd = new Date(config.trainingPeriod.end).getTime();
  return events.every((e) => {
    const t = new Date(e.timestamp).getTime();
    return t < tStart || t > tEnd;
  });
}

export function ResultsDashboard({ result, onBack, darkMode, onToggleDark }: Props) {
  const [currentView, setCurrentView] = useState<DashboardView>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filters, setFilters] = useState({ user: "", host: "", rule: "", severity: "" });
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  const { incidents, events, ingestReport } = result;
  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId) ?? null;
  const showNoBaseline = noBaselineWarning(result);

  function handleSelectView(v: DashboardView) {
    setCurrentView(v);
    // Clear detail panel when navigating away from incidents
    if (v !== "incidents") setSelectedIncidentId(null);
  }

  return (
    <div className={cn("flex h-screen overflow-hidden bg-slate-950 text-slate-100", darkMode ? "dark" : "")}>
      {/* ─── Sidebar ─────────────────────────────────────────────────── */}
      <AppSidebar
        currentView={currentView}
        onSelectView={handleSelectView}
        result={result}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        onBackToUpload={onBack}
      />

      {/* ─── Main Content Column ─────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Sticky header */}
        <DashboardHeader
          result={result}
          currentView={currentView}
          onSelectView={handleSelectView}
          onBackToUpload={onBack}
          darkMode={darkMode}
          onToggleDark={onToggleDark}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        />

        {/* Scrollable page body */}
        <main className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {/* ── Overview ───────────────────────────────────────────── */}
          {currentView === "overview" && (
            <OverviewView
              result={result}
              onGoToIncidents={() => setCurrentView("incidents")}
              showNoBaseline={showNoBaseline}
            />
          )}

          {/* ── Incident Triage ─────────────────────────────────────── */}
          {currentView === "incidents" && (
            <div className="space-y-5">
              <FilterBar filters={filters} onChange={setFilters} />

              {incidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5 py-20 text-center">
                  <ShieldCheck className="mb-4 h-14 w-14 text-emerald-400/50" />
                  <h3 className="text-lg font-bold text-emerald-300">No suspicious activity detected</h3>
                  <p className="mt-2 max-w-sm text-sm text-emerald-600/80">
                    The engine found no incidents matching the configured thresholds. Either the logs are clean, or
                    the thresholds may need adjustment for your environment.
                  </p>
                </div>
              ) : (
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
                      <Shield className="h-3.5 w-3.5 text-cyan-400" />
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
                    <section className="lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-hidden">
                      <IncidentDetail
                        incident={selectedIncident}
                        events={events}
                        onClose={() => setSelectedIncidentId(null)}
                      />
                    </section>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Ingest Diagnostics ─────────────────────────────────── */}
          {currentView === "ingest" && (
            <div className="max-w-4xl">
              <IngestPanel report={ingestReport} />
            </div>
          )}

          {/* ── Detection Rules ─────────────────────────────────────── */}
          {currentView === "rules" && (
            <RulesView />
          )}
        </main>
      </div>
    </div>
  );
}
