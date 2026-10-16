/**
 * Column Mapper for Security Log Ingestion.
 *
 * Normalizes CSV headers by lowercasing and stripping whitespace, underscores,
 * hyphens, and dots. Matches normalized headers against canonical field aliases.
 * When multiple columns match the same canonical field, selects the highest-priority
 * column and logs the conflict resolution.
 */

export type CanonicalField =
  | "timestamp"
  | "username"
  | "sourceIp"
  | "host"
  | "eventType"
  | "result"
  | "logonType"
  | "eventId"
  | "authProtocol"
  | "sourcePort"
  | "destPort"
  | "geoCity"
  | "geoCountry"
  | "userAgent"
  | "subStatus";

export interface AliasDefinition {
  alias: string;
  priority: number;
}

export interface ColumnMapperOptions {
  /** Custom logging function for conflict resolution messages. Defaults to console.warn */
  logger?: (message: string) => void;
  /** If true, suppresses output to logger/console. Defaults to false. */
  silent?: boolean;
  /** User-provided explicit column overrides (rawHeader -> canonicalField or field -> rawHeader) */
  overrides?: Record<string, string>;
}

export interface ColumnMappingResult {
  /** Map of winning raw header -> canonical field name */
  columnMap: Map<string, CanonicalField>;
  /** Map of canonical field name -> winning raw header */
  fieldToColumn: Map<CanonicalField, string>;
  /** Log messages detailing conflict resolutions */
  logs: string[];
  /** Detailed mapping metadata per header */
  mappingInfo?: import("@/types").ColumnMappingInfo[];
}

/**
 * Normalizes a header by lowercasing and stripping spaces, underscores, hyphens, and dots.
 */
export function normalizeHeader(header: string): string {
  if (!header) return "";
  return header.toLowerCase().replace(/[\s_\-\.]+/g, "");
}

/**
 * Priority-ranked alias definitions for canonical fields.
 * Higher priority numbers indicate preferred columns when conflicts occur.
 */
export const ALIAS_DEFINITIONS: Record<CanonicalField, AliasDefinition[]> = {
  timestamp: [
    { alias: "timecreated", priority: 100 },
    { alias: "systemtime", priority: 95 },
    { alias: "timestamp", priority: 90 },
    { alias: "datetime", priority: 85 },
    { alias: "date_time", priority: 85 },
    { alias: "utctime", priority: 80 },
    { alias: "timestamp_utc", priority: 85 },
    { alias: "eventtime", priority: 75 },
    { alias: "event_time", priority: 75 },
    { alias: "event_timestamp", priority: 80 },
    { alias: "eventtimestamp", priority: 80 },
    { alias: "logtime", priority: 70 },
    { alias: "log_time", priority: 70 },
    { alias: "last_seen", priority: 70 },
    { alias: "lastseen", priority: 70 },
    { alias: "created_at", priority: 70 },
    { alias: "createdat", priority: 70 },
    { alias: "time", priority: 50 },
    { alias: "date", priority: 40 },
  ],
  username: [
    { alias: "targetusername", priority: 100 },
    { alias: "targetuser", priority: 95 },
    { alias: "username", priority: 90 },
    { alias: "user_name", priority: 85 },
    { alias: "accountname", priority: 80 },
    { alias: "account_name", priority: 80 },
    { alias: "samaccountname", priority: 75 },
    { alias: "userprincipalname", priority: 75 },
    { alias: "logon_user", priority: 70 },
    { alias: "principal", priority: 70 },
    { alias: "account", priority: 65 },
    { alias: "user", priority: 60 },
    { alias: "subjectusername", priority: 50 },
    { alias: "subject_username", priority: 50 },
  ],
  sourceIp: [
    { alias: "sourceip", priority: 100 },
    { alias: "source_ip", priority: 100 },
    { alias: "src_ip", priority: 95 },
    { alias: "srcip", priority: 95 },
    { alias: "sourcenetworkaddress", priority: 90 },
    { alias: "clientip", priority: 85 },
    { alias: "client_ip", priority: 85 },
    { alias: "ipaddress", priority: 80 },
    { alias: "ip_address", priority: 80 },
    { alias: "remoteip", priority: 75 },
    { alias: "remote_ip", priority: 75 },
    { alias: "remote_addr", priority: 75 },
    { alias: "clientaddress", priority: 70 },
    { alias: "ip", priority: 50 },
  ],
  host: [
    { alias: "computername", priority: 100 },
    { alias: "computer_name", priority: 100 },
    { alias: "workstationname", priority: 95 },
    { alias: "computer", priority: 90 },
    { alias: "host", priority: 85 },
    { alias: "hostname", priority: 80 },
    { alias: "server", priority: 80 },
    { alias: "dest_host", priority: 80 },
    { alias: "desthost", priority: 80 },
    { alias: "workstation", priority: 75 },
    { alias: "machine", priority: 70 },
    { alias: "destination", priority: 65 },
    { alias: "dest", priority: 60 },
    { alias: "targetservername", priority: 55 },
  ],
  eventType: [
    { alias: "eventid", priority: 100 },
    { alias: "event_id", priority: 100 },
    { alias: "event_code", priority: 95 },
    { alias: "eventtype", priority: 90 },
    { alias: "event_type", priority: 90 },
    { alias: "event_name", priority: 85 },
    { alias: "eventname", priority: 85 },
    { alias: "activity", priority: 80 },
    { alias: "action", priority: 75 },
    { alias: "activityid", priority: 70 },
    { alias: "type", priority: 60 },
    { alias: "id", priority: 40 },
  ],
  result: [
    { alias: "result", priority: 100 },
    { alias: "outcome", priority: 95 },
    { alias: "status", priority: 90 },
    { alias: "logon_result", priority: 85 },
    { alias: "auth_result", priority: 85 },
    { alias: "success_failure", priority: 80 },
    { alias: "keywords", priority: 75 },
    { alias: "disposition", priority: 60 },
  ],
  logonType: [
    { alias: "logontype", priority: 100 },
    { alias: "logon_type", priority: 100 },
    { alias: "authtype", priority: 85 },
    { alias: "auth_type", priority: 85 },
    { alias: "logonprocessname", priority: 70 },
  ],
  eventId: [
    { alias: "session_id", priority: 100 },
    { alias: "sessionid", priority: 100 },
    { alias: "request_id", priority: 90 },
    { alias: "requestid", priority: 90 },
    { alias: "record_id", priority: 85 },
    { alias: "recordid", priority: 85 },
  ],
  authProtocol: [
    { alias: "service", priority: 90 },
    { alias: "application", priority: 90 },
    { alias: "protocol", priority: 90 },
    { alias: "auth_method", priority: 85 },
    { alias: "authmethod", priority: 85 },
    { alias: "authentication_package", priority: 80 },
    { alias: "authpackage", priority: 80 },
  ],
  sourcePort: [
    { alias: "source_port", priority: 100 },
    { alias: "sourceport", priority: 100 },
    { alias: "src_port", priority: 95 },
    { alias: "srcport", priority: 95 },
    { alias: "client_port", priority: 85 },
    { alias: "sport", priority: 75 },
  ],
  destPort: [
    { alias: "dest_port", priority: 100 },
    { alias: "destport", priority: 100 },
    { alias: "dst_port", priority: 95 },
    { alias: "dstport", priority: 95 },
    { alias: "destination_port", priority: 90 },
    { alias: "target_port", priority: 85 },
    { alias: "dport", priority: 75 },
  ],
  geoCity: [
    { alias: "city", priority: 100 },
    { alias: "geo_city", priority: 100 },
    { alias: "source_city", priority: 90 },
    { alias: "src_city", priority: 90 },
  ],
  geoCountry: [
    { alias: "country", priority: 100 },
    { alias: "geo_country", priority: 100 },
    { alias: "source_country", priority: 90 },
    { alias: "src_country", priority: 90 },
    { alias: "location", priority: 80 },
    { alias: "region", priority: 70 },
  ],
  userAgent: [
    { alias: "user_agent", priority: 100 },
    { alias: "useragent", priority: 100 },
    { alias: "client_agent", priority: 90 },
    { alias: "clientagent", priority: 90 },
    { alias: "browser", priority: 80 },
  ],
  subStatus: [
    { alias: "sub_status", priority: 100 },
    { alias: "substatus", priority: 100 },
    { alias: "failure_reason", priority: 90 },
    { alias: "error_code", priority: 85 },
    { alias: "status_code", priority: 85 },
  ],
};

interface CandidateMatch {
  header: string;
  normalizedHeader: string;
  priority: number;
  originalIndex: number;
}

/**
 * Resolves CSV headers against canonical fields, selecting the best column
 * when conflicts occur and logging decisions.
 */
export function resolveColumnMap(
  headers: string[],
  options?: ColumnMapperOptions
): ColumnMappingResult {
  const logs: string[] = [];
  const columnMap = new Map<string, CanonicalField>();
  const fieldToColumn = new Map<CanonicalField, string>();

  // Check manual overrides first (supports both rawHeader -> canonical and canonical -> rawHeader)
  const overrides = options?.overrides ?? {};
  const activeOverrides = new Set<string>();

  for (const [k, v] of Object.entries(overrides)) {
    if (!v) continue;
    // If key is a canonical field name and v is in headers:
    if (Object.keys(ALIAS_DEFINITIONS).includes(k) && headers.includes(v)) {
      columnMap.set(v, k as CanonicalField);
      fieldToColumn.set(k as CanonicalField, v);
      activeOverrides.add(v);
      activeOverrides.add(k);
    }
    // If key is in headers and v is a canonical field name:
    else if (headers.includes(k) && Object.keys(ALIAS_DEFINITIONS).includes(v)) {
      columnMap.set(k, v as CanonicalField);
      fieldToColumn.set(v as CanonicalField, k);
      activeOverrides.add(k);
      activeOverrides.add(v);
    }
  }

  // Group candidate matches by canonical field
  const candidatesByField = new Map<CanonicalField, CandidateMatch[]>();

  for (let i = 0; i < headers.length; i++) {
    const rawHeader = headers[i];
    if (activeOverrides.has(rawHeader)) continue;

    const normalized = normalizeHeader(rawHeader);
    if (!normalized) continue;

    for (const [canonicalKey, aliasDefs] of Object.entries(ALIAS_DEFINITIONS) as [
      CanonicalField,
      AliasDefinition[]
    ][]) {
      if (fieldToColumn.has(canonicalKey)) continue; // already mapped via override

      for (const def of aliasDefs) {
        if (normalized === normalizeHeader(def.alias)) {
          if (!candidatesByField.has(canonicalKey)) {
            candidatesByField.set(canonicalKey, []);
          }
          candidatesByField.get(canonicalKey)!.push({
            header: rawHeader,
            normalizedHeader: normalized,
            priority: def.priority,
            originalIndex: i,
          });
          break; // Stop checking alias list for this canonical field
        }
      }
    }
  }

  // Resolve best candidate for each canonical field
  for (const [canonicalField, candidates] of candidatesByField.entries()) {
    if (candidates.length === 0 || fieldToColumn.has(canonicalField)) continue;

    if (candidates.length === 1) {
      const best = candidates[0];
      columnMap.set(best.header, canonicalField);
      fieldToColumn.set(canonicalField, best.header);
      continue;
    }

    // Sort candidates: highest priority first; break ties by earlier index in CSV headers
    candidates.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.originalIndex - b.originalIndex;
    });

    const best = candidates[0];
    columnMap.set(best.header, canonicalField);
    fieldToColumn.set(canonicalField, best.header);

    const candidateSummary = candidates
      .map((c) => `"${c.header}" (priority: ${c.priority})`)
      .join(", ");
    const logMsg = `[ColumnMapper] Multiple columns matched field "${canonicalField}": ${candidateSummary}. Selected "${best.header}" as the best match.`;
    logs.push(logMsg);

    if (!options?.silent) {
      const logFn = options?.logger ?? console.warn;
      logFn(logMsg);
    }
  }

  return { columnMap, fieldToColumn, logs };
}

/**
 * Builds a Map of header -> canonical field name.
 * Drop-in compatible with ingest buildColumnMap, with conflict resolution and logging.
 */
export function buildColumnMap(
  headers: string[],
  options?: ColumnMapperOptions
): Map<string, string> {
  const result = resolveColumnMap(headers, options);
  const map = new Map<string, string>();
  for (const [header, canonical] of result.columnMap.entries()) {
    map.set(header, canonical);
  }
  return map;
}

/**
 * Inspects CSV headers and provides confidence scores, alternate candidates, and ambiguity flags.
 */
export function inspectCsvSchema(
  headers: string[],
  sampleRows: Record<string, string>[] = [],
  overrides?: Record<string, string>
): import("@/types").ColumnMappingInfo[] {
  const resolved = resolveColumnMap(headers, { overrides, silent: true });
  const result: import("@/types").ColumnMappingInfo[] = [];

  for (const header of headers) {
    const canonical = resolved.columnMap.get(header) ?? null;
    const normalized = normalizeHeader(header);

    // Find all canonical matches that matched this header
    const matches: { field: CanonicalField; priority: number }[] = [];
    for (const [field, defs] of Object.entries(ALIAS_DEFINITIONS) as [CanonicalField, AliasDefinition[]][]) {
      for (const d of defs) {
        if (normalized === normalizeHeader(d.alias)) {
          matches.push({ field, priority: d.priority });
          break;
        }
      }
    }

    // Determine confidence
    let confidence = 0;
    if (canonical) {
      const winningDef = ALIAS_DEFINITIONS[canonical]?.find((d) => normalizeHeader(d.alias) === normalized);
      confidence = winningDef ? winningDef.priority / 100 : 0.9;
    }

    // Flag ambiguity if multiple fields matched with close priority or priority < 60
    const isAmbiguous = matches.length > 1 || (confidence > 0 && confidence < 0.65);

    // Extract sample values for preview
    const sampleValues = sampleRows
      .slice(0, 3)
      .map((r) => r[header] ?? "")
      .filter((v) => v.trim() !== "");

    result.push({
      rawHeader: header,
      canonicalField: canonical,
      confidence,
      isAmbiguous,
      alternateCandidates: matches.map((m) => m.field).filter((f) => f !== canonical),
      sampleValues,
    });
  }

  return result;
}

