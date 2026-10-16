"use client";

import { cn } from "cn";
import type { Incident, AnalysisResult } from "@/types";
import { SeverityBadge } from "./SeverityBadge";
import { AlertTriangle, ChevronRight, User, Shield } from "lucide-react";

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
  const fill = (score / 100) * circ;
  const color =
    score >= 90
      ? "#ef4444"
      : score >= 70
      ? "#f97316"
      : score >= 50
      ? "#eab308"
      : "#3b82f6";

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
        />
      </svg>
      <span className="relative text-xs font-bold text-white">{score}</span>
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
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <AlertTriangle className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm">No incidents match the current filters.</p>
      </div>
    );
  }

  const sorted = [...filtered].sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col gap-2">
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

        return (
          <button
            key={inc.id}
            id={`incident-row-${inc.id}`}
            onClick={() => onSelect(inc.id)}
            className={cn(
              "group w-full rounded-xl border p-4 text-left transition-all duration-200",
              "hover:border-blue-500/40 hover:bg-slate-800/60 hover:shadow-lg",
              selectedId === inc.id
                ? "border-blue-500/60 bg-slate-800/80 shadow-lg shadow-blue-500/5"
                : "border-slate-700/50 bg-slate-900/50"
            )}
          >
            <div className="flex items-center gap-4">
              <ScoreRing score={inc.score} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">{inc.id}</span>
                  <SeverityBadge severity={inc.severity} />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-white">
                  <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{inc.username}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {hosts.slice(0, 4).map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-1.5 py-0.5 text-[0.65rem] font-mono text-slate-300"
                    >
                      <Shield className="h-2.5 w-2.5 text-slate-400" />
                      {h}
                    </span>
                  ))}
                  {hosts.length > 4 && (
                    <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[0.65rem] text-slate-400">
                      +{hosts.length - 4} more
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
                  selectedId === inc.id && "rotate-90 text-blue-400"
                )}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
