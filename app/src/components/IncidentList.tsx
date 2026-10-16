"use client";

import { cn } from "@/lib/utils";
import type { Incident, AnalysisResult } from "@/types";
import { SeverityBadge } from "./SeverityBadge";
import { AlertTriangle, ChevronRight, User, Shield, Terminal, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  incidents: Incident[];
  events: AnalysisResult["events"];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filters: {
    user: string;
    host: string;
    rule: string;
    severity: string;
  };
}

function ScoreRing({ score }: { score: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const fill = (Math.min(score, 100) / 100) * circ;
  const color =
    score >= 80
      ? "#ef4444" // red
      : score >= 60
      ? "#f97316" // orange
      : score >= 40
      ? "#eab308" // yellow
      : "#06b6d4"; // cyan

  return (
    <div className="relative flex items-center justify-center h-12 w-12 shrink-0">
      <svg className="absolute -rotate-90" viewBox="0 0 44 44" width="48" height="48">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#1e293b" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="relative text-xs font-bold font-mono text-white tabular-nums">{score}</span>
    </div>
  );
}

export function IncidentList({ incidents, events, selectedId, onSelect, filters }: Props) {
  const filtered = incidents.filter((inc) => {
    if (filters.severity && inc.severity !== filters.severity) return false;
    if (filters.user && !inc.username.toLowerCase().includes(filters.user.toLowerCase()))
      return false;
    if (
      filters.host &&
      !inc.alerts.some((a) =>
        a.evidenceIds.some((eid) => {
          const ev = events.find((e) => e.id === eid);
          return ev?.host.toLowerCase().includes(filters.host.toLowerCase());
        })
      )
    )
      return false;
    if (
      filters.rule &&
      !inc.alerts.some((a) =>
        a.ruleId.toLowerCase().includes(filters.rule.toLowerCase())
      )
    )
      return false;
    return true;
  });

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/80 border border-slate-700 text-slate-500 mb-3">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-slate-300">No security incidents match the current filters.</p>
        <p className="text-xs text-slate-500 mt-1">Try broadening your search term or clearing active severity filters.</p>
      </div>
    );
  }

  const sorted = [...filtered].sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col gap-2.5">
      {sorted.map((inc) => {
        const hosts = Array.from(
          new Set(
            inc.alerts.flatMap((a) =>
              a.evidenceIds
                .map((eid) => events.find((e) => e.id === eid)?.host)
                .filter(Boolean)
            )
          )
        ) as string[];

        const ruleIds = Array.from(new Set(inc.alerts.map((a) => a.ruleId)));
        const isSelected = selectedId === inc.id;

        return (
          <div
            key={inc.id}
            id={`incident-row-${inc.id}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(inc.id)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(inc.id)}
            className={cn(
              "group relative w-full cursor-pointer rounded-xl border p-4 text-left transition-all duration-200 outline-none select-none",
              isSelected
                ? "border-cyan-500/70 bg-slate-800/90 shadow-[0_0_20px_rgba(6,182,212,0.2)] ring-1 ring-cyan-500/50"
                : "border-slate-800/80 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/60 hover:shadow-lg"
            )}
          >
            {/* Left severity indicator glow strip */}
            <div
              className={cn(
                "absolute left-0 top-3 bottom-3 w-1 rounded-r transition-all",
                inc.severity === "critical"
                  ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                  : inc.severity === "high"
                  ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                  : inc.severity === "medium"
                  ? "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]"
                  : "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]"
              )}
            />

            <div className="flex items-center gap-4 pl-1.5">
              <ScoreRing score={inc.score} />

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-400 font-medium">{inc.id}</span>
                  <SeverityBadge severity={inc.severity} />
                  <span className="text-[10px] text-slate-500 font-mono">
                    {inc.alerts.length} alert{inc.alerts.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  <span className="text-sm font-bold text-white tracking-tight truncate group-hover:text-cyan-300 transition-colors">
                    {inc.username}
                  </span>
                </div>

                {/* Target hosts & Rules */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {hosts.slice(0, 3).map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 rounded bg-slate-800/90 border border-slate-700/60 px-1.5 py-0.5 text-[10px] font-mono text-slate-300"
                    >
                      <Shield className="h-2.5 w-2.5 text-slate-400" />
                      {h}
                    </span>
                  ))}
                  {hosts.length > 3 && (
                    <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
                      +{hosts.length - 3} more
                    </span>
                  )}

                  {ruleIds.slice(0, 2).map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center gap-1 rounded bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300"
                    >
                      <Terminal className="h-2.5 w-2.5 text-cyan-400" />
                      {r.replace("RULE-", "")}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                    isSelected
                      ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-300"
                      : "border-slate-800 bg-slate-900 text-slate-500 group-hover:border-slate-700 group-hover:text-slate-300"
                  )}
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      isSelected && "rotate-90 text-cyan-300"
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
