import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  inspectCsvSchema,
  ALIAS_DEFINITIONS,
  type CanonicalField,
} from "@/engine/ingest/columnMapper";
import { normalizeUsername, normalizeIp } from "@/engine/ingest/normalize";
import { normalizeResult } from "@/engine/ingest";
import { parseTimestamp } from "@/engine/ingest/timestampParser";
import type { ColumnMappingInfo } from "@/types";
import {
  Columns,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Table,
  Cpu,
  Layers,
  X,
} from "lucide-react";

interface SchemaMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  currentOverrides: Record<string, string>;
  onSaveOverrides: (overrides: Record<string, string>) => void;
  timezone?: string;
}

const CANONICAL_FIELD_DESCRIPTIONS: Record<
  string,
  { label: string; required: boolean; category: "core" | "network" | "extended" }
> = {
  timestamp: { label: "Timestamp", required: true, category: "core" },
  username: { label: "Username / Account", required: true, category: "core" },
  result: { label: "Auth Result (Success/Fail)", required: true, category: "core" },
  sourceIp: { label: "Source IP Address", required: false, category: "network" },
  host: { label: "Destination Host / Server", required: false, category: "network" },
  eventType: { label: "Event ID / Action Type", required: false, category: "core" },
  logonType: { label: "Logon Type (e.g., 2, 3, 10)", required: false, category: "core" },
  eventId: { label: "Session / Request ID", required: false, category: "extended" },
  authProtocol: { label: "Auth Protocol / Service", required: false, category: "extended" },
  sourcePort: { label: "Source Port", required: false, category: "network" },
  destPort: { label: "Destination Port", required: false, category: "network" },
  geoCity: { label: "Source City", required: false, category: "network" },
  geoCountry: { label: "Source Country / Region", required: false, category: "network" },
  userAgent: { label: "Client User Agent", required: false, category: "extended" },
  subStatus: { label: "Failure Code / SubStatus", required: false, category: "extended" },
};

export function SchemaMappingDialog({
  open,
  onOpenChange,
  file,
  currentOverrides,
  onSaveOverrides,
  timezone = "UTC",
}: SchemaMappingDialogProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>(currentOverrides);
  const [mappings, setMappings] = useState<ColumnMappingInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"mappings" | "preview">("mappings");

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Read first few rows when file or dialog opens
  useEffect(() => {
    if (!open || !file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        preview: 10,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });

      const parsedHeaders = parsed.meta.fields || [];
      const parsedRows = parsed.data || [];

      setHeaders(parsedHeaders);
      setSampleRows(parsedRows);

      const computed = inspectCsvSchema(parsedHeaders, parsedRows, currentOverrides);
      setMappings(computed);
      setOverrides(currentOverrides);
      setLoading(false);
    };

    queueMicrotask(() => {
      setLoading(true);
    });
    reader.readAsText(file.slice(0, 1024 * 64)); // read first 64KB
  }, [open, file, currentOverrides]);

  // Recalculate mappings when user changes an override dropdown
  const handleFieldChange = (header: string, newField: string) => {
    const updated = { ...overrides };
    if (!newField || newField === "none") {
      delete updated[header];
    } else {
      updated[header] = newField;
    }
    setOverrides(updated);
    const recomputed = inspectCsvSchema(headers, sampleRows, updated);
    setMappings(recomputed);
  };

  const handleApply = () => {
    onSaveOverrides(overrides);
    onOpenChange(false);
  };

  const handleReset = () => {
    setOverrides({});
    const recomputed = inspectCsvSchema(headers, sampleRows, {});
    setMappings(recomputed);
  };

  if (!open) return null;

  // Check required fields
  const mappedCanonicalFields = new Set(
    mappings.map((m) => m.canonicalField).filter(Boolean)
  );
  const missingRequired = Object.entries(CANONICAL_FIELD_DESCRIPTIONS)
    .filter(([_, info]) => info.required)
    .map(([field]) => field)
    .filter((f) => !mappedCanonicalFields.has(f));

  // Build normalized preview for sample rows
  const normalizedPreview = sampleRows.slice(0, 5).map((row, idx) => {
    const getVal = (field: string) => {
      const match = mappings.find((m) => m.canonicalField === field);
      return match ? row[match.rawHeader] ?? "" : "";
    };

    const rawTs = getVal("timestamp");
    const parsedTs = parseTimestamp(rawTs, timezone);
    const rawUser = getVal("username");
    const normUser = normalizeUsername(rawUser) || rawUser;
    const rawIp = getVal("sourceIp");
    const normIp = normalizeIp(rawIp) || rawIp;
    const rawResult = getVal("result");
    const normResult = normalizeResult(rawResult, getVal("eventType"));

    return {
      index: idx + 1,
      timestamp: parsedTs || (rawTs ? `⚠️ ${rawTs}` : "—"),
      username: normUser || "—",
      sourceIp: normIp || "—",
      host: getVal("host") || "—",
      result: normResult || "—",
    };
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-4xl max-h-[88vh] overflow-hidden flex flex-col rounded-xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-800 p-4 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-cyan-950/60 border border-cyan-800/50 text-cyan-400">
              <Columns className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-wide text-white">
                Universal CSV Schema Mapping
              </h2>
              <p className="text-xs text-slate-400">
                Inspect and customize column assignments. The adaptive detection engine enables or disables rules based on available mapped fields.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("mappings")}
                className={`px-3 py-1 rounded transition-colors ${
                  activeTab === "mappings"
                    ? "bg-cyan-950 text-cyan-300 font-medium border border-cyan-800/60"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Column Mappings ({headers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1 rounded transition-colors ${
                  activeTab === "preview"
                    ? "bg-cyan-950 text-cyan-300 font-medium border border-cyan-800/60"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Normalized Preview
              </button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Validation warnings */}
        {missingRequired.length > 0 && (
          <div className="mx-6 mt-3 px-3 py-2 bg-amber-950/40 border border-amber-800/60 rounded-md flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              <strong>Missing recommended core fields:</strong>{" "}
              {missingRequired
                .map((f) => CANONICAL_FIELD_DESCRIPTIONS[f]?.label || f)
                .join(", ")}
              . Rules requiring these fields will be disabled or operate in degraded mode.
            </span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
              <div className="h-6 w-6 animate-spin border-2 border-cyan-500 border-t-transparent rounded-full" />
              Parsing CSV schema headers...
            </div>
          ) : activeTab === "mappings" ? (
            <div className="border border-slate-800/80 rounded-lg overflow-hidden bg-slate-900/50">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-2.5 px-3">Original Header</th>
                    <th className="py-2.5 px-3">Normalized Target Field</th>
                    <th className="py-2.5 px-3">Confidence & Flags</th>
                    <th className="py-2.5 px-3">Sample Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {mappings.map((m) => {
                    const isOverridden = Boolean(overrides[m.rawHeader]);
                    const currentField = m.canonicalField;
                    const fieldInfo = currentField
                      ? CANONICAL_FIELD_DESCRIPTIONS[currentField]
                      : null;

                    return (
                      <tr
                        key={m.rawHeader}
                        className="hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2 px-3 font-mono text-slate-200">
                          {m.rawHeader}
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={currentField || "none"}
                            onChange={(e) =>
                              handleFieldChange(m.rawHeader, e.target.value)
                            }
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500 text-xs w-full max-w-[220px]"
                          >
                            <option value="none">-- Unmapped / Ignore --</option>
                            <optgroup label="Core Required Fields">
                              <option value="timestamp">timestamp (Time Created) *</option>
                              <option value="username">username (Account Name) *</option>
                              <option value="result">result (Auth Success/Failure) *</option>
                            </optgroup>
                            <optgroup label="Network & Host Fields">
                              <option value="sourceIp">sourceIp (Client IP)</option>
                              <option value="host">host (Computer / Server)</option>
                              <option value="sourcePort">sourcePort</option>
                              <option value="destPort">destPort</option>
                              <option value="geoCity">geoCity</option>
                              <option value="geoCountry">geoCountry</option>
                            </optgroup>
                            <optgroup label="Extended Security Fields">
                              <option value="eventType">eventType (Event ID / Action)</option>
                              <option value="logonType">logonType (Logon Code)</option>
                              <option value="eventId">eventId (Session / Request ID)</option>
                              <option value="authProtocol">authProtocol (Service / Package)</option>
                              <option value="userAgent">userAgent (Browser / Client)</option>
                              <option value="subStatus">subStatus (NTSTATUS Code)</option>
                            </optgroup>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isOverridden ? (
                              <Badge className="bg-purple-950/80 text-purple-300 border-purple-800/80 text-[10px]">
                                Manual Override
                              </Badge>
                            ) : currentField ? (
                              <Badge
                                className={
                                  m.confidence >= 0.9
                                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/80 text-[10px]"
                                    : "bg-blue-950/80 text-blue-300 border-blue-800/80 text-[10px]"
                                }
                              >
                                {Math.round(m.confidence * 100)}% Match
                              </Badge>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Unmapped</span>
                            )}

                            {m.isAmbiguous && !isOverridden && (
                              <Badge className="bg-amber-950/80 text-amber-300 border-amber-800/80 text-[10px] flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-amber-400" />
                                Ambiguous
                              </Badge>
                            )}

                            {fieldInfo?.required && (
                              <span className="text-[10px] text-cyan-400 font-medium">
                                [Required]
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-400 truncate max-w-[180px]">
                          {m.sampleValues[0] ? `"${m.sampleValues[0]}"` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>
                  Showing normalized representation of first{" "}
                  <strong>{normalizedPreview.length}</strong> rows using active mappings:
                </span>
                <span className="text-cyan-400 font-mono">
                  Timezone: {timezone}
                </span>
              </div>
              <div className="border border-slate-800 rounded-lg overflow-x-auto bg-slate-900/60">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Normalized Timestamp (UTC)</th>
                      <th className="py-2 px-3">Account (Cleaned)</th>
                      <th className="py-2 px-3">Source IP</th>
                      <th className="py-2 px-3">Host</th>
                      <th className="py-2 px-3">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {normalizedPreview.map((row) => (
                      <tr key={row.index} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-500 font-mono">
                          {row.index}
                        </td>
                        <td className="py-2 px-3 font-mono text-cyan-300">
                          {row.timestamp}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-200">
                          {row.username}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-300">
                          {row.sourceIp}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-300">
                          {row.host}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              row.result === "SUCCESS"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                                : row.result === "FAILURE"
                                ? "bg-rose-950 text-rose-400 border border-rose-800/50"
                                : "text-slate-400"
                            }`}
                          >
                            {row.result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 px-6 py-3 flex items-center justify-between bg-slate-950">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Reset to Auto Detection
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
            >
              Confirm Schema Mappings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
