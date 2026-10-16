"use client";

import { cn } from "@/lib/utils";
import { type ReactNode } from "react";
import { Card } from "@/components/ui/card";

interface Props {
  title: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  accent?: "default" | "red" | "orange" | "yellow" | "blue" | "green" | "cyan";
  className?: string;
  trend?: {
    label: string;
    positive?: boolean;
  };
}

const accentMap = {
  default: {
    border: "border-slate-800 hover:border-slate-700",
    glow: "from-slate-500/5",
    iconBg: "bg-slate-800/80 text-slate-300 border-slate-700",
    valColor: "text-white",
  },
  red: {
    border: "border-red-500/30 hover:border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.1)]",
    glow: "from-red-500/15",
    iconBg: "bg-red-950/60 text-red-400 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]",
    valColor: "text-red-300",
  },
  orange: {
    border: "border-amber-500/30 hover:border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.1)]",
    glow: "from-amber-500/15",
    iconBg: "bg-amber-950/60 text-amber-400 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)]",
    valColor: "text-amber-300",
  },
  yellow: {
    border: "border-yellow-500/30 hover:border-yellow-500/50",
    glow: "from-yellow-500/10",
    iconBg: "bg-yellow-950/60 text-yellow-400 border-yellow-500/40",
    valColor: "text-yellow-300",
  },
  blue: {
    border: "border-blue-500/30 hover:border-blue-500/50",
    glow: "from-blue-500/15",
    iconBg: "bg-blue-950/60 text-blue-400 border-blue-500/40",
    valColor: "text-blue-300",
  },
  green: {
    border: "border-emerald-500/30 hover:border-emerald-500/50",
    glow: "from-emerald-500/15",
    iconBg: "bg-emerald-950/60 text-emerald-400 border-emerald-500/40",
    valColor: "text-emerald-300",
  },
  cyan: {
    border: "border-cyan-500/40 hover:border-cyan-400/60 shadow-[0_0_25px_rgba(6,182,212,0.15)]",
    glow: "from-cyan-500/15",
    iconBg: "bg-cyan-950/70 text-cyan-300 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.25)]",
    valColor: "text-cyan-200",
  },
};

export function StatCard({
  title,
  value,
  sub,
  icon,
  accent = "default",
  className,
  trend,
}: Props) {
  const cfg = accentMap[accent] ?? accentMap.default;

  return (
    <Card
      className={cn(
        "relative overflow-hidden p-5 transition-all duration-300 hover:scale-[1.015] bg-slate-900/70 backdrop-blur-md",
        cfg.border,
        className
      )}
    >
      {/* Top subtle glow corner */}
      <div
        className={cn(
          "pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br to-transparent blur-2xl opacity-40",
          cfg.glow
        )}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-slate-400">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums font-mono", cfg.valColor)}>
              {value}
            </span>
          </div>
          {sub && (
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-0.5">
              {sub}
            </p>
          )}
          {trend && (
            <div className="pt-1 flex items-center gap-1 text-[10px] font-mono">
              <span className={trend.positive ? "text-emerald-400" : "text-amber-400"}>
                {trend.label}
              </span>
            </div>
          )}
        </div>

        {icon && (
          <div
            className={cn(
              "shrink-0 rounded-xl p-3 border transition-transform duration-300 group-hover:scale-105",
              cfg.iconBg
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
