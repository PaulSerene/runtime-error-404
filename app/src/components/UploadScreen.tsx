"use client";

import { cn } from "cn";
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
} from "lucide-react";

// ─── Local form state ────────────────────────────────────────────────────────
interface UploadConfig {
  logCsv: File | null;
  assetsCsv: File | null;
  ipLocationCsv: File | null;
  trainingStart: string;
  trainingEnd: string;
  timezone: string;
  failedLogonsPerHour: number;
  distinctHostsPerHour: number;
  offHoursLogonRisk: number;
  lateralMovementHopCount: number;
  maintenanceWindows: { start: string; end: string }[];
  approvedAccounts: string;
  vpnCidrs: string;
}

const TIMEZONES = [
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
  "UTC",
];

// ─── File drop zone ───────────────────────────────────────────────────────────
function FileDropZone({
  id,
  label,
  hint,
  icon: Icon,
  file,
  required,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  icon: React.FC<{ className?: string }>;
  file: File | null;
  required?: boolean;
  disabled?: boolean;
  onChange: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-300">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
        {!required && <span className="ml-1 text-slate-500">(optional)</span>}
      </label>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        id={id}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200",
          disabled && "pointer-events-none opacity-50",
          dragging
            ? "border-blue-400/60 bg-blue-500/10"
            : file
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-slate-700/60 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50"
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
          <>
            <FileText className="mb-2 h-7 w-7 text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-300">{file.name}</p>
            <p className="mt-0.5 text-[0.65rem] text-slate-400">
              {(file.size / 1024).toFixed(1)} KB
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="mt-2 flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.65rem] text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          </>
        ) : (
          <>
            <Icon className="mb-2 h-7 w-7 text-slate-500" />
            <p className="text-sm font-medium text-slate-400">{hint}</p>
            <p className="mt-1 text-[0.65rem] text-slate-600">Drag & drop or click to browse</p>
          </>
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
      failedLogonsPerHour: cfg.failedLogonsPerHour,
      distinctHostsPerHour: cfg.distinctHostsPerHour,
      offHoursLogonRisk: cfg.offHoursLogonRisk,
      lateralMovementHopCount: cfg.lateralMovementHopCount,
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

// ─── Component ───────────────────────────────────────────────────────────────
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
    timezone: "America/New_York",
    failedLogonsPerHour: 10,
    distinctHostsPerHour: 5,
    offHoursLogonRisk: 30,
    lateralMovementHopCount: 3,
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
      // 1. Read files as text
      const logCsvText = await readFileAsText(cfg.logCsv);

      if (!logCsvText.trim()) {
        throw new Error("The log CSV is empty — please upload a file with at least one row.");
      }

      const assetsCsvText = cfg.assetsCsv ? await readFileAsText(cfg.assetsCsv) : undefined;
      const ipLocCsvText = cfg.ipLocationCsv ? await readFileAsText(cfg.ipLocationCsv) : undefined;

      // 2. Build Config from form values
      const config = buildConfig(cfg);

      // 3. Run the engine in a Web Worker (lazy import to avoid SSR issues)
      const { analyzeFile } = await import("@/lib/getResult");
      const result = await analyzeFile(logCsvText, assetsCsvText, ipLocCsvText, config);

      // 4. Guard: no valid rows at all
      if (result.ingestReport.validRows === 0 && result.ingestReport.totalRows > 0) {
        throw new Error(
          `No valid rows found in the log CSV (${result.ingestReport.totalRows} rows parsed, all invalid). ` +
            "Check that the file has the expected columns: timestamp, username, sourceIp, host, eventType, result, logonType."
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
    <div className={cn("min-h-screen bg-slate-950 px-4 py-10", loading && "pointer-events-none")}>
      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-slate-700/50 bg-slate-900 px-12 py-10 shadow-2xl">
            <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
            <p className="text-base font-semibold text-white">Analyzing logs…</p>
            <p className="text-xs text-slate-400">Running engine in background thread</p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
            <Database className="h-3.5 w-3.5" />
            Log Analysis Engine
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white">
            Upload &amp; Configure
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Provide your CSV logs and settings, then run the analysis — or load sample data to explore the dashboard.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-300">Analysis failed</p>
              <p className="mt-1 text-xs leading-relaxed text-red-400">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto shrink-0 rounded-lg p-1 text-red-400/60 hover:text-red-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Sample data CTA */}
        <div className="mb-6 flex flex-col items-center gap-3 sm:flex-row">
          <button
            id="load-sample-data-btn"
            onClick={onLoadSample}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-5 py-3 text-sm font-semibold text-blue-300 transition-all hover:bg-blue-500/20 hover:shadow-lg hover:shadow-blue-500/10 sm:w-auto disabled:opacity-50"
          >
            <Database className="h-4 w-4" />
            Load Sample Data
          </button>
          <span className="text-xs text-slate-600">— or upload your own files below —</span>
        </div>

        {/* File uploads */}
        <div className="mb-6 rounded-2xl border border-slate-700/50 bg-slate-900/70 p-6 backdrop-blur">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-300">
            <Upload className="h-4 w-4 text-blue-400" /> Data Sources
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FileDropZone
              id="upload-log-csv"
              label="Log CSV"
              hint="Windows Security Event Log"
              icon={FileText}
              file={cfg.logCsv}
              required
              disabled={loading}
              onChange={(f) => { set("logCsv", f); setError(null); }}
            />
            <FileDropZone
              id="upload-assets-csv"
              label="Assets CSV"
              hint="Host inventory & roles"
              icon={Monitor}
              file={cfg.assetsCsv}
              disabled={loading}
              onChange={(f) => set("assetsCsv", f)}
            />
            <FileDropZone
              id="upload-ip-csv"
              label="IP Location CSV"
              hint="CIDR → location map"
              icon={MapPin}
              file={cfg.ipLocationCsv}
              disabled={loading}
              onChange={(f) => set("ipLocationCsv", f)}
            />
          </div>
        </div>

        {/* Training period + timezone */}
        <div className="mb-6 rounded-2xl border border-slate-700/50 bg-slate-900/70 p-6 backdrop-blur">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-300">
            <Settings className="h-4 w-4 text-blue-400" /> Training Period &amp; Timezone
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="training-start" className="mb-1 block text-xs font-semibold text-slate-400">
                Training Period Start
              </label>
              <input
                id="training-start"
                type="date"
                value={cfg.trainingStart}
                disabled={loading}
                onChange={(e) => set("trainingStart", e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="training-end" className="mb-1 block text-xs font-semibold text-slate-400">
                Training Period End
              </label>
              <input
                id="training-end"
                type="date"
                value={cfg.trainingEnd}
                disabled={loading}
                onChange={(e) => set("trainingEnd", e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="timezone-select" className="mb-1 block text-xs font-semibold text-slate-400">
                Timezone
              </label>
              <select
                id="timezone-select"
                value={cfg.timezone}
                disabled={loading}
                onChange={(e) => set("timezone", e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Advanced settings collapsible */}
        <div className="mb-8 rounded-2xl border border-slate-700/50 bg-slate-900/70 backdrop-blur overflow-hidden">
          <button
            id="toggle-settings-panel"
            onClick={() => setShowSettings((v) => !v)}
            disabled={loading}
            className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-slate-800/30 transition-colors disabled:opacity-50"
          >
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-300">
              <Settings className="h-4 w-4 text-blue-400" /> Advanced Settings
            </h2>
            {showSettings ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showSettings && (
            <div className="border-t border-slate-700/50 px-6 pb-6 pt-5">
              {/* Thresholds */}
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Thresholds
              </h3>
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    { id: "thresh-failed", key: "failedLogonsPerHour" as const, label: "Failed Logons / hr" },
                    { id: "thresh-hosts", key: "distinctHostsPerHour" as const, label: "Distinct Hosts / hr" },
                    { id: "thresh-offhours", key: "offHoursLogonRisk" as const, label: "Off-hours Risk %" },
                    { id: "thresh-hops", key: "lateralMovementHopCount" as const, label: "Lateral Hop Count" },
                  ] as const
                ).map(({ id, key, label }) => (
                  <div key={key}>
                    <label htmlFor={id} className="mb-1 block text-[0.65rem] font-semibold text-slate-400">
                      {label}
                    </label>
                    <input
                      id={id}
                      type="number"
                      min={1}
                      value={cfg[key]}
                      disabled={loading}
                      onChange={(e) => set(key, parseInt(e.target.value) || 0)}
                      className="h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>

              {/* Maintenance windows */}
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Maintenance Windows
              </h3>
              <div className="mb-5 flex flex-col gap-2">
                {cfg.maintenanceWindows.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      id={`maint-start-${i}`}
                      type="datetime-local"
                      value={w.start}
                      disabled={loading}
                      onChange={(e) => {
                        const mw = [...cfg.maintenanceWindows];
                        mw[i] = { ...mw[i], start: e.target.value };
                        set("maintenanceWindows", mw);
                      }}
                      className="h-8 flex-1 rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                    />
                    <span className="text-xs text-slate-500">→</span>
                    <input
                      id={`maint-end-${i}`}
                      type="datetime-local"
                      value={w.end}
                      disabled={loading}
                      onChange={(e) => {
                        const mw = [...cfg.maintenanceWindows];
                        mw[i] = { ...mw[i], end: e.target.value };
                        set("maintenanceWindows", mw);
                      }}
                      className="h-8 flex-1 rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => delMaint(i)}
                      className="rounded-lg p-1.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  id="add-maintenance-window"
                  type="button"
                  disabled={loading}
                  onClick={addMaint}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-700/60 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-600 hover:text-slate-300 transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add window
                </button>
              </div>

              {/* Approved accounts + VPN CIDRs */}
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="approved-accounts" className="mb-1 block text-xs font-semibold text-slate-400">
                    Approved Accounts{" "}
                    <span className="font-normal text-slate-600">(comma-separated)</span>
                  </label>
                  <input
                    id="approved-accounts"
                    type="text"
                    value={cfg.approvedAccounts}
                    disabled={loading}
                    onChange={(e) => set("approvedAccounts", e.target.value)}
                    placeholder="svc-backup, svc-monitor"
                    className="h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="vpn-cidrs" className="mb-1 block text-xs font-semibold text-slate-400">
                    VPN CIDRs{" "}
                    <span className="font-normal text-slate-600">(comma-separated)</span>
                  </label>
                  <input
                    id="vpn-cidrs"
                    type="text"
                    value={cfg.vpnCidrs}
                    disabled={loading}
                    onChange={(e) => set("vpnCidrs", e.target.value)}
                    placeholder="10.100.0.0/16, 172.20.0.0/14"
                    className="h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <p className="text-xs text-slate-500">
            {cfg.logCsv ? (
              <span className="text-emerald-400">✓ Log CSV ready — {(cfg.logCsv.size / 1024).toFixed(1)} KB</span>
            ) : (
              <span className="text-amber-400">⚠ Log CSV required to run analysis</span>
            )}
          </p>
          <button
            id="run-analysis-btn"
            onClick={handleAnalyze}
            disabled={!cfg.logCsv || loading}
            className={cn(
              "flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all duration-200",
              cfg.logCsv && !loading
                ? "bg-blue-600 text-white hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-500/20"
                : "cursor-not-allowed bg-slate-800 text-slate-600"
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {loading ? "Analyzing…" : "Run Analysis"}
          </button>
        </div>
      </div>
    </div>
  );
}
