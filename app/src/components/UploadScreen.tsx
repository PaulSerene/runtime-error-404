"use client";

import { cn } from "@/lib/utils";
import { useState, useRef } from "react";
import type { AnalysisResult, Config } from "@/types";
import {
  Upload,
  FileText,
  MapPin,
  Monitor,
  Settings,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Play,
  Database,
  X,
  Loader2,
  AlertCircle,
  Shield,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  Radio,
  Cpu,
  Sparkles,
  Calendar,
  Globe,
  Clock,
  KeyRound,
  Network,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

// ─── Local form state ────────────────────────────────────────────────────────
interface UploadConfig {
  logCsv: File | null;
  assetsCsv: File | null;
  ipLocationCsv: File | null;
  trainingStart: string;
  trainingEnd: string;
  timezone: string;
  failureCount: number;
  failureWindowMinutes: number;
  burstFailures: number;
  burstWindowMinutes: number;
  sprayAccounts: number;
  sprayWindowMinutes: number;
  maintenanceWindows: { start: string; end: string }[];
  approvedAccounts: string;
  vpnCidrs: string;
}

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Australia/Sydney",
];

// ─── Modern Cyber File Drop Zone ─────────────────────────────────────────────
function FileDropZone({
  id,
  label,
  hint,
  icon: Icon,
  file,
  required,
  disabled,
  accent = "cyan",
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  icon: React.FC<{ className?: string }>;
  file: File | null;
  required?: boolean;
  disabled?: boolean;
  accent?: "cyan" | "emerald" | "amber";
  onChange: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold tracking-wide text-slate-200 flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-cyan-400" />
          {label}
          {required ? (
            <span className="text-red-400 font-bold">*</span>
          ) : (
            <span className="text-[10px] text-slate-500 font-normal uppercase tracking-wider">(Optional)</span>
          )}
        </label>
        {file && (
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Ready ({(file.size / 1024).toFixed(1)} KB)
          </span>
        )}
      </div>

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        id={id}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center transition-all duration-300 backdrop-blur-sm group select-none",
          disabled && "pointer-events-none opacity-50",
          dragging
            ? "border-cyan-400 bg-cyan-950/40 shadow-[0_0_20px_rgba(6,182,212,0.25)] scale-[1.01]"
            : file
            ? "border-emerald-500/40 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:border-emerald-400/60"
            : "border-slate-800 bg-slate-900/40 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
        )}
        onClick={() => !disabled && ref.current?.click()}
        onKeyDown={(e) => !disabled && e.key === "Enter" && ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          const f = e.dataTransfer.files[0];
          if (f) onChange(f);
        }}
      >
        <input
          ref={ref}
          type="file"
          accept=".csv"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />

        {file ? (
          <div className="flex w-full items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <FileText className="h-5 w-5" />
              </div>
              <div className="text-left truncate">
                <p className="truncate text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                  {file.name}
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {(file.size / 1024).toFixed(1)} KB • CSV Document
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                if (ref.current) ref.current.value = "";
              }}
              className="rounded-md p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
              title="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-300 group-hover:scale-110 group-hover:border-cyan-500/50 group-hover:text-cyan-400 transition-all duration-300">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-200">
                Drop CSV file here, or <span className="text-cyan-400 font-semibold underline underline-offset-2">browse</span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers: read file + build Config ───────────────────────────────────────
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

function buildConfig(cfg: UploadConfig): Config {
  return {
    thresholds: {
      failureCount: cfg.failureCount,
      failureWindowMinutes: cfg.failureWindowMinutes,
      burstFailures: cfg.burstFailures,
      burstWindowMinutes: cfg.burstWindowMinutes,
      sprayAccounts: cfg.sprayAccounts,
      sprayWindowMinutes: cfg.sprayWindowMinutes,
    },
    trainingPeriod: {
      start: cfg.trainingStart ? `${cfg.trainingStart}T00:00:00Z` : "2024-02-01T00:00:00Z",
      end: cfg.trainingEnd ? `${cfg.trainingEnd}T23:59:59Z` : "2024-02-29T23:59:59Z",
    },
    timezone: cfg.timezone,
    maintenanceWindows: cfg.maintenanceWindows
      .filter((w) => w.start && w.end)
      .map((w) => ({
        start: w.start.includes("T") ? `${w.start}:00Z` : `${w.start}T00:00:00Z`,
        end: w.end.includes("T") ? `${w.end}:00Z` : `${w.end}T00:00:00Z`,
      })),
    approvedAccounts: cfg.approvedAccounts
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    vpnCidrs: cfg.vpnCidrs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    assets: [],
    privilegedAccounts: [],
    ipLocations: [],
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  onResult: (result: AnalysisResult) => void;
  onLoadSample: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function UploadScreen({ onResult, onLoadSample }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cfg, setCfg] = useState<UploadConfig>({
    logCsv: null,
    assetsCsv: null,
    ipLocationCsv: null,
    trainingStart: "2024-02-01",
    trainingEnd: "2024-02-29",
    timezone: "UTC",
    failureCount: 5,
    failureWindowMinutes: 10,
    burstFailures: 3,
    burstWindowMinutes: 15,
    sprayAccounts: 5,
    sprayWindowMinutes: 10,
    maintenanceWindows: [{ start: "2024-03-10T02:00", end: "2024-03-10T04:00" }],
    approvedAccounts: "svc-backup, svc-monitor",
    vpnCidrs: "10.100.0.0/16, 172.20.0.0/14",
  });

  const set = <K extends keyof UploadConfig>(k: K, v: UploadConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const addMaint = () =>
    set("maintenanceWindows", [...cfg.maintenanceWindows, { start: "", end: "" }]);
  const delMaint = (i: number) =>
    set("maintenanceWindows", cfg.maintenanceWindows.filter((_, j) => j !== i));

  async function handleAnalyze() {
    if (!cfg.logCsv) return;
    setError(null);
    setLoading(true);

    try {
      const logCsvText = await readFileAsText(cfg.logCsv);
      if (!logCsvText.trim()) {
        throw new Error("The log CSV is empty — please upload a file with at least one row.");
      }

      const assetsCsvText = cfg.assetsCsv ? await readFileAsText(cfg.assetsCsv) : undefined;
      const ipLocCsvText = cfg.ipLocationCsv ? await readFileAsText(cfg.ipLocationCsv) : undefined;

      const config = buildConfig(cfg);
      const { analyzeFile } = await import("@/lib/getResult");
      const result = await analyzeFile(logCsvText, assetsCsvText, ipLocCsvText, config);

      if (result.ingestReport.validRows === 0 && result.ingestReport.totalRows > 0) {
        throw new Error(
          `No valid rows found in the log CSV (${result.ingestReport.totalRows} rows parsed, all rejected). ` +
            "Please check that the file includes valid timestamp, username, host, or eventType columns."
        );
      }

      onResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,35,70,0.5),rgba(3,7,18,1))] text-slate-100 flex flex-col justify-between">
      {/* Background cyber grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-8 shadow-[0_0_50px_rgba(6,182,212,0.25)] text-center max-w-sm">
            <div className="relative">
              <div className="absolute -inset-2 rounded-full bg-cyan-500/20 blur-md animate-pulse" />
              <Loader2 className="h-10 w-10 animate-spin text-cyan-400 relative z-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">Running SOC Detection Engine</h3>
              <p className="text-xs text-slate-400">
                Stream-parsing CSV, building baseline distributions, and applying correlation rules in Web Worker...
              </p>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full w-2/3 animate-[pulse_1.5s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">
        {/* Top Header & Badges */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-8 border-b border-slate-800/80">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/40 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  VANGUARD <span className="text-cyan-400 font-mono text-sm px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50">SOC DETECTOR</span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Client-Side Windows Security Log Ingestion & Advanced Threat Correlation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Badge variant="cyan" className="font-mono text-[11px] py-1">
              <Radio className="h-3 w-3 text-cyan-400 animate-pulse" /> ENGINE ACTIVE
            </Badge>
            <Badge variant="secondary" className="font-mono text-[11px] py-1 border-slate-700">
              <Cpu className="h-3 w-3 text-slate-400" /> ZERO-CLOUD PRIVACY
            </Badge>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.15)]">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-red-300">Ingestion Error</p>
              <p className="text-red-200/90 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Center Grid: Telemetry Feeds vs Calibration */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Data Feeds (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            <Card className="border-slate-800/80 bg-slate-900/60 shadow-xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-white">
                  <Database className="h-4 w-4 text-cyan-400" />
                  Telemetry Data Sources
                </CardTitle>
                <CardDescription>
                  Upload your event logs and optional metadata mapping CSV exports
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FileDropZone
                  id="log-csv"
                  label="Windows Security Event Log CSV"
                  hint="Exported from Event Viewer (Event IDs 4624, 4625, 4634, 4648, etc.)"
                  icon={Shield}
                  file={cfg.logCsv}
                  required
                  disabled={loading}
                  onChange={(f) => set("logCsv", f)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <FileDropZone
                    id="assets-csv"
                    label="Host Assets Catalog"
                    hint="CSV mapping host, role, privileged"
                    icon={Monitor}
                    file={cfg.assetsCsv}
                    disabled={loading}
                    onChange={(f) => set("assetsCsv", f)}
                  />

                  <FileDropZone
                    id="ip-location-csv"
                    label="IP Geolocation CIDR"
                    hint="CSV mapping CIDRs to locations"
                    icon={MapPin}
                    file={cfg.ipLocationCsv}
                    disabled={loading}
                    onChange={(f) => set("ipLocationCsv", f)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Quick Demo Pre-load Box */}
            <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/30 via-slate-900/40 to-slate-900/60 p-4.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-white">Explore with Pre-Loaded Attack Scenarios</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Instant analysis of credential stuffing, password spray, lateral movement & off-hours brute force.
                </p>
              </div>

              <Button
                type="button"
                id="load-sample-btn"
                variant="outline"
                size="sm"
                onClick={onLoadSample}
                disabled={loading}
                className="shrink-0 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-400 transition-all font-semibold"
              >
                Load Sample Dataset
              </Button>
            </div>
          </div>

          {/* Right Column: Baseline Calibration & Environment (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            <Card className="border-slate-800/80 bg-slate-900/60 shadow-xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-white">
                  <Clock className="h-4 w-4 text-cyan-400" />
                  Baseline Calibration Window
                </CardTitle>
                <CardDescription>
                  Define standard operating period and timestamp timezone context
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" /> Baseline Start
                    </label>
                    <Input
                      id="training-start"
                      type="date"
                      value={cfg.trainingStart}
                      disabled={loading}
                      onChange={(e) => set("trainingStart", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" /> Baseline End
                    </label>
                    <Input
                      id="training-end"
                      type="date"
                      value={cfg.trainingEnd}
                      disabled={loading}
                      onChange={(e) => set("trainingEnd", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                    <Globe className="h-3 w-3 text-slate-400" /> Log Timezone Alignment
                  </label>
                  <select
                    id="timezone-select"
                    value={cfg.timezone}
                    disabled={loading}
                    onChange={(e) => set("timezone", e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-100 shadow-inner focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz} className="bg-slate-900 text-slate-100">
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                <Separator className="my-2 bg-slate-800" />

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                    <KeyRound className="h-3 w-3 text-slate-400" /> Whitelisted Service Accounts
                  </label>
                  <Input
                    id="approved-accounts"
                    value={cfg.approvedAccounts}
                    disabled={loading}
                    onChange={(e) => set("approvedAccounts", e.target.value)}
                    placeholder="e.g. svc-backup, svc-scan"
                  />
                  <p className="text-[10px] text-slate-500">Comma-separated; suppresses false alarms from known automation.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                    <Network className="h-3 w-3 text-slate-400" /> Authorized VPN CIDRs
                  </label>
                  <Input
                    id="vpn-cidrs"
                    value={cfg.vpnCidrs}
                    disabled={loading}
                    onChange={(e) => set("vpnCidrs", e.target.value)}
                    placeholder="e.g. 10.100.0.0/16, 172.20.0.0/14"
                  />
                  <p className="text-[10px] text-slate-500">Corporate remote access ranges excluded from geo-anomaly alerts.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Collapsible Advanced Thresholds & Maintenance Windows */}
        <div className="mt-6">
          <button
            type="button"
            id="toggle-settings-btn"
            onClick={() => setShowSettings((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-3 text-left transition-all hover:border-slate-700 hover:bg-slate-900/80"
          >
            <div className="flex items-center gap-2.5">
              <Sliders className="h-4 w-4 text-cyan-400" />
              <div>
                <span className="text-xs font-semibold text-white">Detection Rules Thresholds & Maintenance Windows</span>
                <span className="ml-2 text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                  TUNABLE PARAMETERS
                </span>
              </div>
            </div>
            {showSettings ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showSettings && (
            <Card className="mt-3 border-slate-800/80 bg-slate-900/60 shadow-xl">
              <CardContent className="pt-5 space-y-6">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5" /> Core Detection Thresholds
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5 rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
                      <label className="text-xs font-medium text-slate-200">Brute Force Threshold</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={cfg.failureCount}
                          disabled={loading}
                          onChange={(e) => set("failureCount", Number(e.target.value))}
                        />
                        <span className="text-[11px] text-slate-400 font-mono">failures</span>
                      </div>
                      <p className="text-[10px] text-slate-500">In {cfg.failureWindowMinutes} min window per user</p>
                    </div>

                    <div className="space-y-1.5 rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
                      <label className="text-xs font-medium text-slate-200">Burst-Then-Success</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={cfg.burstFailures}
                          disabled={loading}
                          onChange={(e) => set("burstFailures", Number(e.target.value))}
                        />
                        <span className="text-[11px] text-slate-400 font-mono">fails prior</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Within {cfg.burstWindowMinutes} min before login</p>
                    </div>

                    <div className="space-y-1.5 rounded-lg border border-slate-800/60 bg-slate-950/40 p-3">
                      <label className="text-xs font-medium text-slate-200">Password Spray Accounts</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={2}
                          max={50}
                          value={cfg.sprayAccounts}
                          disabled={loading}
                          onChange={(e) => set("sprayAccounts", Number(e.target.value))}
                        />
                        <span className="text-[11px] text-slate-400 font-mono">accounts</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Targeted from single IP in {cfg.sprayWindowMinutes}m</p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-800" />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Maintenance Suppression Windows
                    </h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={addMaint}
                      disabled={loading}
                      className="border-slate-700 text-slate-300 hover:text-white"
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Window
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {cfg.maintenanceWindows.map((w, idx) => (
                      <div key={idx} className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                        <span className="text-xs font-mono text-slate-500 w-6">#{idx + 1}</span>
                        <div className="grid grid-cols-2 gap-2 flex-1">
                          <Input
                            type="datetime-local"
                            value={w.start}
                            disabled={loading}
                            onChange={(e) => {
                              const updated = [...cfg.maintenanceWindows];
                              updated[idx].start = e.target.value;
                              set("maintenanceWindows", updated);
                            }}
                          />
                          <Input
                            type="datetime-local"
                            value={w.end}
                            disabled={loading}
                            onChange={(e) => {
                              const updated = [...cfg.maintenanceWindows];
                              updated[idx].end = e.target.value;
                              set("maintenanceWindows", updated);
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => delMaint(idx)}
                          disabled={loading}
                          className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Primary Action Button Bar */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-end gap-3.5 pt-4">
          <Button
            type="button"
            id="analyze-btn"
            size="lg"
            disabled={!cfg.logCsv || loading}
            onClick={handleAnalyze}
            className={cn(
              "w-full sm:w-auto min-w-[220px] font-semibold tracking-wide transition-all duration-300",
              cfg.logCsv
                ? "bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-[0_0_25px_rgba(6,182,212,0.4)] cursor-pointer"
                : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-cyan-300" />
                Analyzing Telemetry...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4 fill-current" />
                Analyze Logs Now
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Footer Branding */}
      <footer className="relative z-10 py-4 text-center text-xs text-slate-600 border-t border-slate-800/40">
        VANGUARD Cyber Telemetry SOC • Next.js 16 • Turbopack • Web Worker Execution
      </footer>
    </div>
  );
}
