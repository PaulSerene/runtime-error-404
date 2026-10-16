"use client";

import { cn } from "cn";
import { type ReactNode } from "react";

interface Props {
  title: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  accent?: "default" | "red" | "orange" | "yellow" | "blue" | "green";
  className?: string;
}

const accentMap = {
  default: "from-slate-500/10 border-slate-500/20 text-slate-300",
  red: "from-red-500/15 border-red-500/30 text-red-400",
  orange: "from-orange-500/15 border-orange-500/30 text-orange-400",
  yellow: "from-yellow-500/15 border-yellow-500/30 text-yellow-400",
  blue: "from-blue-500/15 border-blue-500/30 text-blue-400",
  green: "from-emerald-500/15 border-emerald-500/30 text-emerald-400",
};

export function StatCard({ title, value, sub, icon, accent = "default", className }: Props) {
  const accentCls = accentMap[accent];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-br to-transparent p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl",
        accentCls,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium tracking-wider uppercase text-slate-400">{title}</p>
          <p className="mt-1 text-3xl font-bold text-white tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        {icon && (
          <div className={cn("shrink-0 rounded-lg p-2", accentCls)}>{icon}</div>
        )}
      </div>
      {/* decorative gradient orb */}
      <div className="pointer-events-none absolute -right-8 -bottom-8 h-24 w-24 rounded-full bg-current opacity-5 blur-2xl" />
    </div>
  );
}
