"use client";

import { cn } from "@/lib/utils";
import type { Incident, LogEvent } from "@/types";
import { SeverityBadge } from "./SeverityBadge";
import {
  AlertTriangle,
  Shield,
  Clock,
  User,
  Terminal,
  CheckSquare,
  X,
  Info,
  ChevronDown,
  ChevronUp,
  Network,
  Copy,
  Check,
  Calendar,
  Layers,
  ArrowRight,
  ListOrdered,
  FileSearch,
} from "lucide-react";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Props {
  incident: Incident;
  events: LogEvent[];
  onClose: () => void;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function ScoreBar({ label, points }: { label: string; points: number }) {
  const pct = Math.abs(points);
  const isNeg = points < 0;

  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-800/50 last:border-0">
      <div className="flex-1 text-xs text-slate-300 font-medium">{label}</div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 w-28 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              isNeg ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
            )}
            style={{ width: `${Math.min(100, (pct / 60) * 100)}%` }}
          />
        </div>
        <span
          className={cn(
            "w-9 text-right text-xs font-mono font-bold tabular-nums px-1.5 py-0.5 rounded",
            isNeg
              ? "text-emerald-400 bg-emerald-950/40 border border-emerald-800/40"
              : "text-red-400 bg-red-950/40 border border-red-800/40"
          )}
        >
          {points > 0 ? "+" : ""}{points}
        </span>
      </div>
    </div>
  );
}

export function IncidentDetail({ incident, events, onClose }: Props) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const evidenceEvents = events.filter((e) =>
    incident.alerts.flatMap((a) => a.evidenceIds).includes(e.id)
  );

  const timeline = [...evidenceEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const toggleStep = (idx: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const copyRow = (rowText: string, id: string) => {
    navigator.clipboard.writeText(rowText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/90 shadow-2xl backdrop-blur-md">
      {/* Top Banner Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5 bg-slate-950/40">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-cyan-400 bg-cyan-950/60 px-2.5 py-1 rounded border border-cyan-800/40 font-semibold">
              {incident.id}
            </span>
            <SeverityBadge severity={incident.severity} showIcon />
            <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
              {incident.disposition}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2 text-lg font-bold text-white">
            <User className="h-4 w-4 text-cyan-400" />
            <span className="tracking-tight">{incident.username}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-center shadow-inner">
            <span className="text-3xl font-black font-mono tabular-nums text-white leading-none">
              {incident.score}
            </span>
            <span className="text-[9px] font-semibold tracking-widest uppercase text-cyan-400 pt-1">
              Risk Score
            </span>
          </div>

          <Button
            id="close-incident-detail"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Required SOC Triage Disclaimer */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.08)]">
          <Info className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-semibold text-amber-300">Suspicious Activity Indication</p>
            <p className="text-amber-200/80 leading-relaxed">
              These findings represent suspicious behavioral indicators calculated from anomalous telemetry. They do not constitute confirmed compromise without analyst investigation and corroborating host forensics.
            </p>
          </div>
        </div>

        {/* Narrative Summary */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4.5 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <FileSearch className="h-3.5 w-3.5 text-cyan-400" /> Incident Assessment
          </h3>
          <p className="text-xs text-slate-200 leading-relaxed">
            {incident.explanation}
          </p>
        </div>

        {/* Risk Score Breakdown */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4.5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-cyan-400" /> Risk Score Composition
          </h3>
          <div className="divide-y divide-slate-800/40">
            {incident.scoreBreakdown.map((entry, idx) => (
              <ScoreBar key={idx} label={entry.label} points={entry.points} />
            ))}
          </div>
        </div>

        {/* Correlated Alerts Chain */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-cyan-400" />
            Correlated Detection Alerts ({incident.alerts.length})
          </h3>

          <div className="space-y-2.5">
            {incident.alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2 transition-all hover:border-slate-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-cyan-300">
                      {alert.ruleId}
                    </span>
                    <SeverityBadge severity={alert.severity} />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-500" />
                    {fmt(alert.timeStart)}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {alert.explanation}
                </p>

                {Object.keys(alert.details).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {Object.entries(alert.details).map(([k, v]) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400"
                      >
                        <span className="text-slate-500">{k}:</span>
                        <span className="text-slate-300">{Array.isArray(v) ? v.join(", ") : String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Chronological Attack Timeline */}
        {timeline.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-cyan-400" />
              Event Timeline Progression ({timeline.length} events)
            </h3>

            <div className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {timeline.slice(0, 8).map((evt, idx) => (
                <div key={evt.id || idx} className="relative flex items-start gap-3 text-xs">
                  <div className="absolute -left-6 top-1 h-2 w-2 rounded-full bg-cyan-400 ring-4 ring-cyan-950" />
                  <div className="flex-1 rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>{fmt(evt.timestamp)}</span>
                      <span className={cn(
                        "font-semibold",
                        evt.result?.toUpperCase() === "SUCCESS" ? "text-emerald-400" : "text-red-400"
                      )}>
                        {evt.result || "EVENT"} ({evt.eventType})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 flex items-center gap-3">
                      <span>Host: <strong className="text-white font-mono">{evt.host || "N/A"}</strong></span>
                      {evt.sourceIp && <span>IP: <strong className="text-white font-mono">{evt.sourceIp}</strong></span>}
                    </div>
                  </div>
                </div>
              ))}
              {timeline.length > 8 && (
                <p className="text-[11px] font-mono text-slate-500 italic pl-1">
                  +{timeline.length - 8} additional timeline events captured
                </p>
              )}
            </div>
          </div>
        )}

        {/* Recommended Triage Steps Checklist */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <CheckSquare className="h-3.5 w-3.5 text-cyan-400" />
              Recommended Analyst Triage Checklist
            </h3>
            <span className="text-[10px] font-mono text-cyan-400">
              {completedSteps.size} / {incident.triageSteps.length} Completed
            </span>
          </div>

          <div className="space-y-2">
            {incident.triageSteps.map((step, idx) => {
              const done = completedSteps.has(idx);
              return (
                <div
                  key={idx}
                  onClick={() => toggleStep(idx)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-2.5 text-xs cursor-pointer transition-all duration-200 select-none",
                    done
                      ? "border-emerald-500/30 bg-emerald-950/15 text-slate-400 line-through"
                      : "border-slate-800/80 bg-slate-900/60 text-slate-200 hover:border-slate-700"
                  )}
                >
                  <div className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    done
                      ? "border-emerald-500 bg-emerald-500 text-slate-950"
                      : "border-slate-700 bg-slate-800"
                  )}>
                    {done && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <span className="leading-relaxed">{step}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Evidence Log Payload Table (Expandable) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
          <button
            type="button"
            id="toggle-evidence-btn"
            onClick={() => setShowEvidence((v) => !v)}
            className="flex w-full items-center justify-between p-4 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-900 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-cyan-400" />
              Raw Event Evidence Logs ({evidenceEvents.length} Rows)
            </span>
            {showEvidence ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showEvidence && (
            <div className="p-4 pt-0 border-t border-slate-800/80 space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Event ID</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Source IP</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidenceEvents.map((evt) => (
                    <TableRow key={evt.id}>
                      <TableCell className="font-mono text-xs">{fmt(evt.timestamp)}</TableCell>
                      <TableCell className="font-mono text-xs text-cyan-300">{evt.eventType}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-mono font-bold",
                          evt.result?.toUpperCase() === "SUCCESS"
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                            : "bg-red-950/60 text-red-400 border border-red-800/40"
                        )}>
                          {evt.result || "UNKNOWN"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{evt.host || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-400">{evt.sourceIp || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => copyRow(evt.rawRow, evt.id)}
                          title="Copy raw CSV row"
                          className="text-slate-400 hover:text-white"
                        >
                          {copiedId === evt.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
