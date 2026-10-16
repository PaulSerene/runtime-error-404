import { cn } from "cn";
import type { Severity } from "@/types";

interface Props {
  severity: Severity;
  className?: string;
}

const config: Record<Severity, { label: string; cls: string }> = {
  critical: {
    label: "CRITICAL",
    cls: "bg-red-500/20 text-red-400 border-red-500/40 ring-red-500/20",
  },
  high: {
    label: "HIGH",
    cls: "bg-orange-500/20 text-orange-400 border-orange-500/40 ring-orange-500/20",
  },
  medium: {
    label: "MEDIUM",
    cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40 ring-yellow-500/20",
  },
  low: {
    label: "LOW",
    cls: "bg-blue-500/20 text-blue-400 border-blue-500/40 ring-blue-500/20",
  },
};

export function SeverityBadge({ severity, className }: Props) {
  const { label, cls } = config[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold tracking-widest uppercase ring-1",
        cls,
        className
      )}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse"
        aria-hidden
      />
      {label}
    </span>
  );
}
