"use client";

import { cn } from "@/lib/utils";
import { Search, Filter, X, Shield, User, HardDrive, KeyRound } from "lucide-react";
import type { Severity } from "@/types";
import { Button } from "@/components/ui/button";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

const SEVERITY_BUTTON_STYLES: Record<Severity, { active: string; inactive: string }> = {
  critical: {
    active: "bg-red-500/20 text-red-300 border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.3)] font-bold",
    inactive: "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-red-500/40 hover:text-red-300",
  },
  high: {
    active: "bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-[0_0_10px_rgba(245,158,11,0.25)] font-bold",
    inactive: "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-amber-500/40 hover:text-amber-300",
  },
  medium: {
    active: "bg-yellow-500/20 text-yellow-300 border-yellow-500/60 shadow-[0_0_8px_rgba(234,179,8,0.2)] font-bold",
    inactive: "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-yellow-500/40 hover:text-yellow-300",
  },
  low: {
    active: "bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.2)] font-bold",
    inactive: "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300",
  },
};

interface Filters {
  user: string;
  host: string;
  rule: string;
  severity: string;
}

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  matchCount?: number;
}

export function FilterBar({ filters, onChange, matchCount }: Props) {
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-xl backdrop-blur-md">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Filter className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-white">
            Incident Correlation Filters
          </span>
          {matchCount !== undefined && (
            <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
              {matchCount} matched
            </span>
          )}
        </div>

        {hasFilters && (
          <Button
            id="clear-all-filters"
            variant="ghost"
            size="xs"
            onClick={() => onChange({ user: "", host: "", rule: "", severity: "" })}
            className="text-xs text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Reset Filters
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* User filter */}
        <div className="relative">
          <label htmlFor="filter-user" className="mb-1 block text-[11px] font-semibold text-slate-300 flex items-center gap-1">
            <User className="h-3 w-3 text-slate-400" /> Filter User Account
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              id="filter-user"
              type="text"
              value={filters.user}
              onChange={(e) => onChange({ ...filters, user: e.target.value })}
              placeholder="e.g. adm-svc, victim_user"
              className="h-8 w-full rounded-lg border border-slate-700/80 bg-slate-900/80 pl-8 pr-7 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
            {filters.user && (
              <button
                type="button"
                onClick={() => onChange({ ...filters, user: "" })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Host filter */}
        <div className="relative">
          <label htmlFor="filter-host" className="mb-1 block text-[11px] font-semibold text-slate-300 flex items-center gap-1">
            <HardDrive className="h-3 w-3 text-slate-400" /> Filter Target Host
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              id="filter-host"
              type="text"
              value={filters.host}
              onChange={(e) => onChange({ ...filters, host: e.target.value })}
              placeholder="e.g. DC01, WS-001"
              className="h-8 w-full rounded-lg border border-slate-700/80 bg-slate-900/80 pl-8 pr-7 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
            {filters.host && (
              <button
                type="button"
                onClick={() => onChange({ ...filters, host: "" })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Rule ID filter */}
        <div className="relative">
          <label htmlFor="filter-rule" className="mb-1 block text-[11px] font-semibold text-slate-300 flex items-center gap-1">
            <KeyRound className="h-3 w-3 text-slate-400" /> Filter Rule ID
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              id="filter-rule"
              type="text"
              value={filters.rule}
              onChange={(e) => onChange({ ...filters, rule: e.target.value })}
              placeholder="e.g. BRUTE-FORCE, SPRAY"
              className="h-8 w-full rounded-lg border border-slate-700/80 bg-slate-900/80 pl-8 pr-7 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
            {filters.rule && (
              <button
                type="button"
                onClick={() => onChange({ ...filters, rule: "" })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Severity filter pills */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-300 flex items-center gap-1">
            <Shield className="h-3 w-3 text-slate-400" /> Threat Severity
          </label>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {SEVERITIES.map((sev) => {
              const isActive = filters.severity === sev;
              const styles = SEVERITY_BUTTON_STYLES[sev];
              return (
                <button
                  key={sev}
                  type="button"
                  id={`filter-severity-${sev}`}
                  onClick={() =>
                    onChange({ ...filters, severity: isActive ? "" : sev })
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase transition-all duration-200 cursor-pointer select-none",
                    isActive ? styles.active : styles.inactive
                  )}
                >
                  {sev}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
