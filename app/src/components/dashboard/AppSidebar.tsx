"use client";

import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  LayoutDashboard,
  AlertTriangle,
  DatabaseZap,
  Sliders,
  Upload,
  Download,
  FileCode2,
  ChevronLeft,
  ChevronRight,
  Shield,
  Activity,
  Terminal,
  Server,
  KeyRound,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportCsv, exportHtmlReport, exportJson } from "@/lib/exports";
import type { AnalysisResult } from "@/types";

export type DashboardView = "overview" | "incidents" | "ingest" | "rules" | "upload";

interface Props {
  currentView: DashboardView;
  onSelectView: (v: DashboardView) => void;
  result: AnalysisResult;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onBackToUpload: () => void;
}

export function AppSidebar({
  currentView,
  onSelectView,
  result,
  collapsed,
  onToggleCollapse,
  onBackToUpload,
}: Props) {
  const { incidents, events, ingestReport } = result;
  const criticalCount = incidents.filter((i) => i.severity === "critical").length;
  const highCount = incidents.filter((i) => i.severity === "high").length;

  const navItems = [
    {
      id: "overview" as DashboardView,
      label: "SOC Overview",
      icon: LayoutDashboard,
      badge: `${incidents.length}`,
      badgeVariant: criticalCount > 0 ? ("critical" as const) : ("default" as const),
    },
    {
      id: "incidents" as DashboardView,
      label: "Incident Triage",
      icon: AlertTriangle,
      badge: `${criticalCount + highCount} High+`,
      badgeVariant: criticalCount > 0 ? ("critical" as const) : ("warning" as const),
    },
    {
      id: "ingest" as DashboardView,
      label: "Ingest Diagnostics",
      icon: DatabaseZap,
      badge: `${ingestReport.validRows}`,
      badgeVariant: "secondary" as const,
    },
    {
      id: "rules" as DashboardView,
      label: "Detection Rules",
      icon: Terminal,
      badge: "6 Rules",
      badgeVariant: "secondary" as const,
    },
  ];

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-slate-800/80 bg-slate-950/90 backdrop-blur-xl transition-all duration-300 z-30 select-none",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Sidebar Header Brand */}
      <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-4">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/50 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)]">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white font-mono">VANGUARD</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/50">
                  SOC
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono">v2.4 Telemetry</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/50 text-cyan-400">
            <ShieldAlert className="h-5 w-5" />
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:flex h-6 w-6 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-white transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Threat Status Capsule */}
      {!collapsed && (
        <div className="p-3">
          <div className={cn(
            "rounded-xl border p-3 flex items-center justify-between transition-all",
            criticalCount > 0
              ? "border-red-500/30 bg-red-950/20 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
              : "border-cyan-500/30 bg-cyan-950/20 text-cyan-300"
          )}>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                  criticalCount > 0 ? "bg-red-400" : "bg-cyan-400"
                )} />
                <span className={cn(
                  "relative inline-flex rounded-full h-2 w-2",
                  criticalCount > 0 ? "bg-red-500" : "bg-cyan-500"
                )} />
              </span>
              <span className="text-xs font-bold font-mono tracking-wider">
                {criticalCount > 0 ? "THREAT ELEVATED" : "SOC NOMINAL"}
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700">
              {incidents.length} INCIDENTS
            </span>
          </div>
        </div>
      )}

      {/* Nav Menu */}
      <div className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Monitoring
          </p>
        )}

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 outline-none select-none",
                isActive
                  ? "border border-cyan-500/40 bg-cyan-950/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.15)] font-bold"
                  : "border border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-200"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300")} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {item.badge && (
                    <Badge variant={item.badgeVariant} className="text-[10px] px-1.5 py-0 font-mono">
                      {item.badge}
                    </Badge>
                  )}
                </>
              )}
            </button>
          );
        })}

        {!collapsed && (
          <div className="pt-4 pb-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Actions & Telemetry
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onBackToUpload}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 border border-slate-800/80 bg-slate-900/40 text-slate-300 hover:border-cyan-500/40 hover:bg-slate-800/70 hover:text-cyan-300",
            collapsed && "justify-center px-0"
          )}
          title="Upload / Re-calibrate Data"
        >
          <Upload className="h-4 w-4 shrink-0 text-cyan-400" />
          {!collapsed && <span>New Log Ingest</span>}
        </button>
      </div>

      {/* Sidebar Footer: Export Buttons */}
      <div className="border-t border-slate-800/80 p-3 space-y-2 bg-slate-950/60">
        {!collapsed ? (
          <>
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Export Intelligence
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={() => exportCsv(result)}
                className="w-full border-slate-700/80 bg-slate-900/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 text-[10px] px-1"
                title="CSV Export"
              >
                <Download className="mr-1 h-3 w-3" /> CSV
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => exportJson(result)}
                className="w-full border-slate-700/80 bg-slate-900/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 text-[10px] px-1"
                title="JSON Export"
              >
                <Download className="mr-1 h-3 w-3" /> JSON
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => exportHtmlReport(result)}
                className="w-full border-slate-700/80 bg-slate-900/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 text-[10px] px-1"
                title="HTML Report"
              >
                <FileCode2 className="mr-1 h-3 w-3" /> HTML
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2 items-center">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => exportCsv(result)}
              title="Export CSV"
              className="text-slate-400 hover:text-cyan-300"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => exportJson(result)}
              title="Export JSON"
              className="text-slate-400 hover:text-cyan-300"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => exportHtmlReport(result)}
              title="Export HTML"
              className="text-slate-400 hover:text-cyan-300"
            >
              <FileCode2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
