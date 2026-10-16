"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Terminal,
  Sliders,
  Clock,
  Globe,
  Users,
  Network,
  Wifi,
  Lock,
} from "lucide-react";

// Static rule catalogue — maps rule IDs to descriptions & metadata.
// Extend this list as new guards are added to the engine.
const RULES = [
  {
    id: "bruteForce",
    name: "Brute Force Detection",
    icon: Lock,
    description: "Detects rapid sequential authentication failures from a single account within a configurable sliding window.",
    requiredFields: ["user", "eventId", "timestamp"],
    category: "Authentication",
    mitre: "T1110",
    threshold: "≥ N failures / window",
  },
  {
    id: "credentialSpray",
    name: "Credential Spray",
    icon: Network,
    description: "Identifies a single source IP targeting many distinct accounts in a short time, characteristic of password spraying.",
    requiredFields: ["user", "sourceIp", "eventId", "timestamp"],
    category: "Authentication",
    mitre: "T1110.003",
    threshold: "≥ N accounts / window",
  },
  {
    id: "offHoursAccess",
    name: "Off-Hours Access",
    icon: Clock,
    description: "Flags successful logons that occur outside normal business hours as defined in the configuration.",
    requiredFields: ["user", "timestamp", "eventId"],
    category: "Behavioral",
    mitre: "T1078",
    threshold: "Configurable hour range",
  },
  {
    id: "newHostAccess",
    name: "New Host Access",
    icon: Terminal,
    description: "Alerts when a user accesses a workstation not seen in their training-period baseline.",
    requiredFields: ["user", "workstation", "timestamp"],
    category: "Lateral Movement",
    mitre: "T1021",
    threshold: "Baseline comparison",
  },
  {
    id: "newIpOrLocation",
    name: "New IP / Geo-Location",
    icon: Globe,
    description: "Detects logins from IP addresses or geolocations not present in the user's baseline profile.",
    requiredFields: ["user", "sourceIp", "timestamp"],
    category: "Anomaly",
    mitre: "T1078.004",
    threshold: "Baseline comparison",
  },
  {
    id: "privilegedAccountAbuse",
    name: "Privileged Account Abuse",
    icon: Shield,
    description: "Monitors sensitive accounts (admin, service accounts) for unusual activity patterns or off-schedule access.",
    requiredFields: ["user", "timestamp", "eventId"],
    category: "Privilege Escalation",
    mitre: "T1078.002",
    threshold: "Approved account list",
  },
] as const;

const CATEGORY_COLOR: Record<string, string> = {
  Authentication: "text-blue-400 border-blue-500/30 bg-blue-950/30",
  Behavioral: "text-purple-400 border-purple-500/30 bg-purple-950/30",
  "Lateral Movement": "text-amber-400 border-amber-500/30 bg-amber-950/30",
  Anomaly: "text-cyan-400 border-cyan-500/30 bg-cyan-950/30",
  "Privilege Escalation": "text-red-400 border-red-500/30 bg-red-950/30",
};

interface Props {
  activeRuleIds?: string[];
  skippedRuleIds?: string[];
}

export function RulesView({ activeRuleIds, skippedRuleIds }: Props) {
  const active = new Set(activeRuleIds ?? RULES.map((r) => r.id));
  const skipped = new Set(skippedRuleIds ?? []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Terminal className="h-5 w-5 text-cyan-400" />
            Detection Rules Catalogue
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Behavioral correlation rules applied to ingested telemetry. Required fields determine whether a rule can run on the uploaded dataset.
          </p>
        </div>
        <div className="flex gap-2 text-[11px] font-mono">
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-3 py-1 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            {active.size} Active
          </span>
          {skipped.size > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-950/30 px-3 py-1 text-amber-400">
              <XCircle className="h-3 w-3" />
              {skipped.size} Skipped
            </span>
          )}
        </div>
      </div>

      {/* Rule Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {RULES.map((rule) => {
          const isActive = active.has(rule.id) && !skipped.has(rule.id);
          const isSkipped = skipped.has(rule.id);
          const Icon = rule.icon;
          const catColor = CATEGORY_COLOR[rule.category] ?? "text-slate-400 border-slate-700 bg-slate-900";

          return (
            <Card
              key={rule.id}
              className={cn(
                "relative overflow-hidden bg-slate-900/70 backdrop-blur-md p-5 transition-all duration-200",
                isSkipped
                  ? "border-amber-500/20 opacity-70"
                  : isActive
                  ? "border-slate-700/80 hover:border-cyan-500/30"
                  : "border-slate-800/50"
              )}
            >
              {/* Status bar on left edge */}
              <div
                className={cn(
                  "absolute left-0 top-0 bottom-0 w-0.5",
                  isSkipped ? "bg-amber-500/60" : isActive ? "bg-cyan-500/60" : "bg-slate-700"
                )}
              />

              <div className="flex items-start gap-4">
                <div className={cn("shrink-0 rounded-xl border p-2.5", catColor)}>
                  <Icon className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-bold text-white">{rule.name}</h3>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", catColor)}>
                      {rule.category}
                    </span>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                      {rule.mitre}
                    </span>
                    {isSkipped ? (
                      <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                        <XCircle className="h-2.5 w-2.5" /> SKIPPED
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        <CheckCircle2 className="h-2.5 w-2.5" /> ACTIVE
                      </span>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed text-slate-400 mb-3">{rule.description}</p>

                  <div className="flex flex-wrap gap-3 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Sliders className="h-3 w-3 text-slate-500" />
                      <span className="text-slate-400">{rule.threshold}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-slate-500">Required:</span>
                      {rule.requiredFields.map((f) => (
                        <span key={f} className="font-mono rounded bg-slate-800/80 border border-slate-700 px-1.5 py-0.5 text-slate-300">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Coverage disclaimer */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 px-5 py-4 text-xs text-slate-500 leading-relaxed">
        <span className="font-semibold text-slate-400">Coverage note: </span>
        Rules that lack required columns in the uploaded dataset are automatically skipped and logged in the Ingest Diagnostics panel.
        Extend coverage by uploading supplemental Assets CSV (for host data) or IP-location CSV (for geo enrichment).
      </div>
    </div>
  );
}
