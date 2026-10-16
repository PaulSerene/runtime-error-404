import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-all focus:outline-none select-none",
  {
    variants: {
      variant: {
        default:
          "border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]",
        secondary:
          "border border-slate-700 bg-slate-800/80 text-slate-300",
        destructive:
          "border border-red-500/30 bg-red-500/15 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]",
        warning:
          "border border-amber-500/30 bg-amber-500/15 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]",
        success:
          "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]",
        outline:
          "border border-slate-700 text-slate-300 hover:bg-slate-800/50",
        critical:
          "border border-red-500/40 bg-red-950/60 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.35)] animate-pulse",
        cyan:
          "border border-cyan-400/40 bg-cyan-950/50 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.25)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
