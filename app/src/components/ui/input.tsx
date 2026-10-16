import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 shadow-inner transition-all",
        "focus-visible:border-cyan-500 focus-visible:ring-1 focus-visible:ring-cyan-500/50 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
