"use client";

import { cn } from "@/lib/utils";
import type { AnalysisResult } from "@/types";
import { StatCard } from "@/components/StatCard";
import {
  Activity,
  Shield,
  AlertTriangle,
  FileWarning,
  Copy,
  ShieldCheck,
  TrendingUp,
  Users,
  Server,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  result: AnalysisResult;
  onGoToIncidents: () => void;
  showNoBaseline: boolean;
}

function severityBarColor(s: string) {
  switch (s) {
    case "critical": return "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]";
    case "high":     return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
    case "medium":   return "bg-yellow-400/90";
    case "low":      return "bg-emerald-500";
    default:         return "bg-slate-600";
  }
}

export function OverviewView({ result, onGoToIncidents, showNoBaseline }: Props) {
  const { incidents, events, ingestReport, config } = result;

  const severityOrder = ["critical", "high", "medium", "low"] as const;
  const severityCount = (s: string) => incidents.filter((i) => i.severity === s).length;
  const totalIncidents = incidents.length;

  const ruleMatches = result.alerts.filter((a) => a.kind !== "anomaly").length;
  const anomalyMatches = result.alerts.filter((a) => a.kind === "anomaly").length;
  const affectedAccounts = new Set(incidents.map((i) => i.username)).size;
  const affectedHostsCount = new Set(incidents.flatMap((i) => i.affectedHosts ?? [])).size;
  const enabledCaps = result.capabilities?.filter((c) => c.status === "enabled").length ?? 0;
  const totalCaps = result.capabilities?.length ?? 11;

  const userMap: Record<string, number> = {};
  for (const inc of incidents) {
    userMap[inc.username] = (userMap[inc.username] ?? 0) + 1;
  }
  const topUsers = Object.entries(userMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const ruleMap: Record<string, number> = {};
  for (const inc of incidents) {
    for (const alert of inc.alerts) {
      ruleMap[alert.ruleId] = (ruleMap[alert.ruleId] ?? 0) + 1;
    }
  }
  const topRules = Object.entries(ruleMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxRuleCount = topRules[0]?.[1] ?? 1;

  return (
    <div className="space-y-6">
      {showNoBaseline && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-300">No baseline could be learned</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-400">
              All events fall outside the configured training period (
              {config.trainingPeriod.start.slice(0, 10)} → {config.trainingPeriod.end.slice(0, 10)}).
              Detections that depend on a learned baseline may be unreliable.
            </p>
          </div>
        </div>
      )}

      {/* Top Telemetry & Investigation Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Total Events" value={events.length.toLocaleString()} icon={<Activity className="h-4 w-4" />} accent="cyan" sub="parsed telemetry" />
        <StatCard title="Incidents" value={totalIncidents} icon={<Shield className="h-4 w-4" />} accent="blue" sub={`${affectedAccounts} account(s), ${affectedHostsCount} host(s)`} />
        <StatCard title="Rule Matches" value={ruleMatches} icon={<ShieldCheck className="h-4 w-4" />} accent="orange" sub="deterministic rules" />
        <StatCard title="Statistical Anomalies" value={anomalyMatches} icon={<Activity className="h-4 w-4" />} accent="cyan" sub="MAD baseline shifts" />
        <StatCard title="Capability Coverage" value={`${enabledCaps}/${totalCaps}`} icon={<TrendingUp className="h-4 w-4" />} accent="green" sub="detection methods active" />
        <StatCard title="Data Quality" value={ingestReport.invalidRows.length === 0 ? "100%" : `${ingestReport.validRows}/${ingestReport.totalRows}`} sub={ingestReport.invalidRows.length > 0 ? `${ingestReport.invalidRows.length} invalid` : "0 invalid rows"} icon={<FileWarning className="h-4 w-4" />} accent={ingestReport.invalidRows.length > 0 ? "yellow" : "green"} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-1 bg-slate-900/70 border-slate-800/80 p-5 backdrop-blur-md">
          <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
            Severity Distribution
          </h3>
          {totalIncidents === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <ShieldCheck className="mb-2 h-10 w-10 text-emerald-400/40" />
              <p className="text-xs text-emerald-400">All clear — no incidents</p>
            </div>
          ) : (
            <div className="space-y-3">
              {severityOrder.map((s) => {
                const count = severityCount(s);
                const pct = totalIncidents > 0 ? (count / totalIncidents) * 100 : 0;
                return (
                  <div key={s}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-semibold capitalize text-slate-300">{s}</span>
                      <span className="font-mono text-[11px] text-slate-400">{count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className={cn("h-full rounded-full transition-all duration-700", severityBarColor(s))} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="col-span-1 bg-slate-900/70 border-slate-800/80 p-5 backdrop-blur-md">
          <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <Users className="h-3.5 w-3.5 text-cyan-400" />
            Top Risk Subjects
          </h3>
          {topUsers.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No incidents found</p>
          ) : (
            <div className="space-y-2">
              {topUsers.map(([user, count], i) => (
                <div key={user} className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-800/30 px-3 py-2 hover:border-cyan-500/20 hover:bg-slate-800/50 transition-all cursor-pointer" onClick={onGoToIncidents}>
                  <span className="w-4 text-[10px] font-mono text-slate-500">#{i + 1}</span>
                  <span className="flex-1 truncate font-mono text-xs font-medium text-slate-200 capitalize">{user}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold font-mono", i === 0 ? "bg-red-950/60 text-red-300 border border-red-500/30" : "bg-slate-800 text-slate-300 border border-slate-700")}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="col-span-1 bg-slate-900/70 border-slate-800/80 p-5 backdrop-blur-md">
          <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <Server className="h-3.5 w-3.5 text-cyan-400" />
            Top Detection Rules
          </h3>
          {topRules.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No alerts fired</p>
          ) : (
            <div className="space-y-2.5">
              {topRules.map(([rule, count]) => (
                <div key={rule}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="truncate font-mono text-[11px] text-slate-300 max-w-[70%]">{rule}</span>
                    <span className="font-mono text-[11px] font-bold text-cyan-400">{count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-cyan-500/70 transition-all duration-700" style={{ width: `${(count / maxRuleCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="bg-slate-900/60 border-slate-800/60 p-4 backdrop-blur-md">
        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Active Configuration</h3>
        <div className="flex flex-wrap gap-2 text-[11px] font-mono">
          <span className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-1 text-slate-300">tz: {config.timezone}</span>
          <span className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-1 text-slate-300">
            training: {config.trainingPeriod.start.slice(0, 10)} → {config.trainingPeriod.end.slice(0, 10)}
          </span>
          <span className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-1 text-slate-300">
            ingest quality: {ingestReport.totalRows > 0 ? `${((ingestReport.validRows / ingestReport.totalRows) * 100).toFixed(1)}%` : "n/a"}
          </span>
          {config.approvedAccounts.map((a) => (
            <span key={a} className="rounded-md border border-emerald-800/50 bg-emerald-950/40 px-2 py-1 text-emerald-400">✓ {a}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}
