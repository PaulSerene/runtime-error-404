"use client";

import { cn } from "cn";
import { useState, useRef } from "react";
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
} from "lucide-react";

// ─── Types for local upload state ────────────────────────────────────────────
interface UploadConfig {
  logCsv: File | null;
  assetsCsv: File | null;
  ipLocationCsv: File | null;
  trainingStart: string;
  trainingEnd: string;
  timezone: string;
  // settings
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

function FileDropZone({
  id,
  label,
  hint,
  icon: Icon,
  file,
  required,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  icon: React.FC<{ className?: string }>;
  file: File | null;
  required?: boolean;
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
        tabIndex={0}
        id={id}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200",
          dragging
            ? "border-blue-400/60 bg-blue-500/10"
            : file
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-slate-700/60 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50"
        )}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) onChange(f);
        }}
      >
        <input
          ref={ref}
          type="file"
          accept=".csv"
          className="sr-only"
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

interface Props {
  onAnalyze: () => void;
  onLoadSample: () => void;
}

export function UploadScreen({ onAnalyze, onLoadSample }: Props) {
  const [showSettings, setShowSettings] = useState(false);
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
    set(
      "maintenanceWindows",
      cfg.maintenanceWindows.filter((_, j) => j !== i)
    );

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
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

        {/* Sample data CTA */}
        <div className="mb-6 flex flex-col items-center gap-3 sm:flex-row">
          <button
            id="load-sample-data-btn"
            onClick={onLoadSample}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-5 py-3 text-sm font-semibold text-blue-300 transition-all hover:bg-blue-500/20 hover:shadow-lg hover:shadow-blue-500/10 sm:w-auto"
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
              onChange={(f) => set("logCsv", f)}
            />
            <FileDropZone
              id="upload-assets-csv"
              label="Assets CSV"
              hint="Host inventory & roles"
              icon={Monitor}
              file={cfg.assetsCsv}
              onChange={(f) => set("assetsCsv", f)}
            />
            <FileDropZone
              id="upload-ip-csv"
              label="IP Location CSV"
              hint="CIDR → location map"
              icon={MapPin}
              file={cfg.ipLocationCsv}
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
                onChange={(e) => set("trainingStart", e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
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
                onChange={(e) => set("trainingEnd", e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>
            <div>
              <label htmlFor="timezone-select" className="mb-1 block text-xs font-semibold text-slate-400">
                Timezone
              </label>
              <select
                id="timezone-select"
                value={cfg.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
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
            className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-slate-800/30 transition-colors"
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
                      onChange={(e) => set(key, parseInt(e.target.value) || 0)}
                      className="h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
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
                      onChange={(e) => {
                        const mw = [...cfg.maintenanceWindows];
                        mw[i] = { ...mw[i], start: e.target.value };
                        set("maintenanceWindows", mw);
                      }}
                      className="h-8 flex-1 rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                    <span className="text-xs text-slate-500">→</span>
                    <input
                      id={`maint-end-${i}`}
                      type="datetime-local"
                      value={w.end}
                      onChange={(e) => {
                        const mw = [...cfg.maintenanceWindows];
                        mw[i] = { ...mw[i], end: e.target.value };
                        set("maintenanceWindows", mw);
                      }}
                      className="h-8 flex-1 rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 text-xs text-slate-200 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => delMaint(i)}
                      className="rounded-lg p-1.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  id="add-maintenance-window"
                  type="button"
                  onClick={addMaint}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-700/60 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-600 hover:text-slate-300 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add window
                </button>
              </div>

              {/* Approved accounts */}
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="approved-accounts" className="mb-1 block text-xs font-semibold text-slate-400">
                    Approved Accounts{" "}
                    <span className="text-slate-600 font-normal">(comma-separated)</span>
                  </label>
                  <input
                    id="approved-accounts"
                    type="text"
                    value={cfg.approvedAccounts}
                    onChange={(e) => set("approvedAccounts", e.target.value)}
                    placeholder="svc-backup, svc-monitor"
                    className="h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="vpn-cidrs" className="mb-1 block text-xs font-semibold text-slate-400">
                    VPN CIDRs{" "}
                    <span className="text-slate-600 font-normal">(comma-separated)</span>
                  </label>
                  <input
                    id="vpn-cidrs"
                    type="text"
                    value={cfg.vpnCidrs}
                    onChange={(e) => set("vpnCidrs", e.target.value)}
                    placeholder="10.100.0.0/16, 172.20.0.0/14"
                    className="h-8 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
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
              <span className="text-emerald-400">✓ Log CSV ready</span>
            ) : (
              <span className="text-amber-400">⚠ Log CSV required to run analysis</span>
            )}
          </p>
          <button
            id="run-analysis-btn"
            onClick={onAnalyze}
            disabled={!cfg.logCsv}
            className={cn(
              "flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all duration-200",
              cfg.logCsv
                ? "bg-blue-600 text-white hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-500/20"
                : "cursor-not-allowed bg-slate-800 text-slate-600"
            )}
          >
            <Play className="h-4 w-4" />
            Run Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
