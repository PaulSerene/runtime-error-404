"use client";

import { cn } from "cn";
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
} from "lucide-react";
import { useState } from "react";

interface Props {
  incident: Incident;
  events: LogEvent[];
  onClose: () => void;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function ScoreBar({ label, points }: { label: string; points: number }) {
  const pct = Math.abs(points);
  const isNeg = points < 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex-1 text-xs text-slate-300">{label}</div>
      <div className="flex items-center gap-2">
        <div className="h-2 w-32 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              isNeg ? "bg-emerald-500/60" : "bg-red-400/80"
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span
          className={cn(
            "w-8 text-right text-xs font-bold tabular-nums",
            isNeg ? "text-emerald-400" : "text-red-400"
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
  const evidenceEvents = events.filter((e) =>
    incident.alerts.flatMap((a) => a.evidenceIds).includes(e.id)
  );

  // Timeline: collect all timestamps from evidence events
  const timeline = [...evidenceEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const totalScore = incident.scoreBreakdown.reduce((s, e) => s + e.points, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-700/50 px-6 py-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-400">{incident.id}</span>
            <SeverityBadge severity={incident.severity} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-lg font-bold text-white">
            <User className="h-4 w-4 text-slate-400" />
            {incident.username}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="text-4xl font-black tabular-nums text-white">{incident.score}</span>
            <span className="text-[0.6rem] font-medium tracking-widest uppercase text-slate-400">Risk Score</span>
          </div>
          <button
            id="close-incident-detail"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ⚠️ Disclaimer banner */}
        <div className="mx-6 mt-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-300">
            <strong className="font-semibold">Important:</strong> These are{" "}
            <em>suspicious indications</em>, not confirmed compromise. An analyst must
            review, validate, and determine the appropriate response before taking action.
          </p>
        </div>

        {/* Score breakdown */}
        <section className="px-6 pt-5">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <Shield className="h-3.5 w-3.5" /> Score Breakdown
          </h3>
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-4 py-2">
            {incident.scoreBreakdown.map((entry, i) => (
              <div
                key={i}
                className={cn(i !== 0 && "border-t border-slate-700/30")}
              >
                <ScoreBar label={entry.label} points={entry.points} />
              </div>
            ))}
            <div className="mt-1 flex justify-end border-t border-slate-700/50 pt-2">
              <span className="text-xs text-slate-400">
                Total:{" "}
                <strong className="text-white">{totalScore}</strong>
                {totalScore !== incident.score && (
                  <span className="ml-1 text-slate-500">
                    → normalised to <strong className="text-white">{incident.score}</strong>
                  </span>
                )}
              </span>
            </div>
          </div>
        </section>

        {/* Explanation */}
        <section className="px-6 pt-5">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Explanation
          </h3>
          <p className="text-sm leading-relaxed text-slate-300">{incident.explanation}</p>
        </section>

        {/* Alerts */}
        <section className="px-6 pt-5">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <Network className="h-3.5 w-3.5" /> Constituent Alerts ({incident.alerts.length})
          </h3>
          <div className="flex flex-col gap-2">
            {incident.alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[0.65rem] text-slate-400">{alert.id}</span>
                  <SeverityBadge severity={alert.severity} />
                  <span className="rounded-md bg-slate-700/60 px-1.5 py-0.5 font-mono text-[0.65rem] text-slate-300">
                    {alert.ruleId}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">{alert.explanation}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[0.65rem] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmt(alert.timeStart)}
                  </span>
                  {alert.timeEnd !== alert.timeStart && (
                    <span>→ {fmt(alert.timeEnd)}</span>
                  )}
                </div>
                {/* details */}
                {Object.keys(alert.details).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(alert.details).map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded bg-slate-700/50 px-1.5 py-0.5 font-mono text-[0.6rem] text-slate-400"
                      >
                        {k}:{" "}
                        <span className="text-slate-200">
                          {Array.isArray(v) ? v.join(", ") : String(v)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Timeline */}
        <section className="px-6 pt-5">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <Clock className="h-3.5 w-3.5" /> Event Timeline
          </h3>
          <div className="relative ml-3 border-l border-slate-700/60 pl-5">
            {timeline.map((ev, i) => {
              const isLast = i === timeline.length - 1;
              const isSuccess = ev.result === "SUCCESS";
              return (
                <div key={ev.id} className={cn("relative pb-4", isLast && "pb-0")}>
                  <div
                    className={cn(
                      "absolute -left-[22px] h-3 w-3 rounded-full border-2 border-slate-900",
                      isSuccess ? "bg-emerald-500" : "bg-red-500"
                    )}
                  />
                  <div className="rounded-lg border border-slate-700/30 bg-slate-800/30 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-[0.65rem]">
                      <span className="font-mono text-slate-400">{fmt(ev.timestamp)}</span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-bold",
                          isSuccess
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        )}
                      >
                        {ev.result}
                      </span>
                      <span className="rounded bg-slate-700/50 px-1.5 py-0.5 font-mono text-slate-300">
                        {ev.eventType}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-300">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-slate-500" />
                        {ev.username}
                      </span>
                      <span className="flex items-center gap-1">
                        <Shield className="h-3 w-3 text-slate-500" />
                        {ev.host}
                      </span>
                      <span className="font-mono text-slate-400">{ev.sourceIp}</span>
                    </div>
                    {ev.flags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {ev.flags.map((f) => (
                          <span
                            key={f}
                            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium text-amber-400"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Evidence table */}
        <section className="px-6 pt-5">
          <button
            id="toggle-evidence-table"
            onClick={() => setShowEvidence((v) => !v)}
            className="mb-3 flex w-full items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/30 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:bg-slate-800/60 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5" />
              Raw Evidence Rows ({evidenceEvents.length})
            </span>
            {showEvidence ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {showEvidence && (
            <div className="overflow-x-auto rounded-lg border border-slate-700/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/60">
                    {["Timestamp", "User", "Source IP", "Host", "Event", "Result", "Logon"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-400"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {evidenceEvents.map((ev, i) => (
                    <tr
                      key={ev.id}
                      className={cn(
                        "border-b border-slate-800/50 transition-colors hover:bg-slate-800/30",
                        i % 2 === 0 ? "bg-slate-900/30" : "bg-slate-900/10"
                      )}
                    >
                      <td className="px-3 py-1.5 font-mono text-slate-300">
                        {new Date(ev.timestamp).toISOString().replace("T", " ").replace("Z", " Z")}
                      </td>
                      <td className="px-3 py-1.5 font-semibold text-white">{ev.username}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-300">{ev.sourceIp}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-300">{ev.host}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-300">{ev.eventType}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-bold",
                            ev.result === "SUCCESS"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          )}
                        >
                          {ev.result}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-slate-300">{ev.logonType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Triage steps */}
        <section className="px-6 py-5">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <CheckSquare className="h-3.5 w-3.5" /> Recommended Triage Steps
          </h3>
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
            <ol className="flex flex-col gap-2">
              {incident.triageSteps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-300">
                  <span className="shrink-0 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-400">
                    {i + 1}
                  </span>
                  <span>{step.replace(/^\d+\.\s*/, "")}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
