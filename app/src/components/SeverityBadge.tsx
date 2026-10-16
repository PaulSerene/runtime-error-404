import { cn } from "@/lib/utils";
import type { Severity } from "@/types";
import { ShieldAlert, AlertTriangle, AlertCircle, ShieldCheck } from "lucide-react";

interface Props {
  severity: Severity;
  className?: string;
  showIcon?: boolean;
}

const config: Record<
  Severity,
  { label: string; badgeCls: string; dotCls: string; icon: React.FC<{ className?: string }> }
> = {
  critical: {
    label: "CRITICAL",
    badgeCls: "bg-red-950/70 text-red-300 border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.3)] ring-1 ring-red-500/30",
    dotCls: "bg-red-400 animate-ping",
    icon: ShieldAlert,
  },
  high: {
    label: "HIGH",
    badgeCls: "bg-amber-950/60 text-amber-300 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.25)] ring-1 ring-amber-500/30",
    dotCls: "bg-amber-400 animate-pulse",
    icon: AlertTriangle,
  },
  medium: {
    label: "MEDIUM",
    badgeCls: "bg-yellow-950/50 text-yellow-300 border-yellow-500/40 shadow-[0_0_8px_rgba(234,179,8,0.2)] ring-1 ring-yellow-500/20",
    dotCls: "bg-yellow-400",
    icon: AlertCircle,
  },
  low: {
    label: "LOW",
    badgeCls: "bg-cyan-950/50 text-cyan-300 border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.2)] ring-1 ring-cyan-500/20",
    dotCls: "bg-cyan-400",
    icon: ShieldCheck,
  },
};

export function SeverityBadge({ severity, className, showIcon = false }: Props) {
  const item = config[severity] ?? config.low;
  const Icon = item.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold font-mono tracking-wider uppercase backdrop-blur-sm select-none",
        item.badgeCls,
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", item.dotCls)} />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
      </span>
      {showIcon && <Icon className="h-3 w-3" />}
      {item.label}
    </span>
  );
}
