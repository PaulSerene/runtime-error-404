"use client";

import { cn } from "cn";
import { Search, Filter, X } from "lucide-react";
import type { Severity } from "@/types";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/40",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/40",
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
}

function FilterInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 pl-8 pr-8 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function FilterBar({ filters, onChange }: Props) {
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        {hasFilters && (
          <button
            id="clear-all-filters"
            onClick={() => onChange({ user: "", host: "", rule: "", severity: "" })}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.65rem] font-medium text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterInput
          id="filter-user"
          label="User"
          value={filters.user}
          placeholder="e.g. adm-jsmith"
          onChange={(v) => onChange({ ...filters, user: v })}
        />
        <FilterInput
          id="filter-host"
          label="Host"
          value={filters.host}
          placeholder="e.g. DC01"
          onChange={(v) => onChange({ ...filters, host: v })}
        />
        <FilterInput
          id="filter-rule"
          label="Rule ID"
          value={filters.rule}
          placeholder="e.g. TOR-PRIV"
          onChange={(v) => onChange({ ...filters, rule: v })}
        />

        {/* Severity pill selector */}
        <div>
          <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
            Severity
          </label>
          <div className="flex flex-wrap gap-1.5">
            {SEVERITIES.map((sev) => (
              <button
                key={sev}
                id={`filter-severity-${sev}`}
                onClick={() =>
                  onChange({ ...filters, severity: filters.severity === sev ? "" : sev })
                }
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide transition-all duration-150",
                  filters.severity === sev
                    ? SEVERITY_COLORS[sev]
                    : "border-slate-700/50 bg-slate-800/50 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                )}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
