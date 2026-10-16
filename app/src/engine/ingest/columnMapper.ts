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
  | "logonType";

export interface AliasDefinition {
  alias: string;
  priority: number;
}

export interface ColumnMapperOptions {
  /** Custom logging function for conflict resolution messages. Defaults to console.warn */
  logger?: (message: string) => void;
  /** If true, suppresses output to logger/console. Defaults to false. */
  silent?: boolean;
}

export interface ColumnMappingResult {
  /** Map of winning raw header -> canonical field name */
  columnMap: Map<string, CanonicalField>;
  /** Map of canonical field name -> winning raw header */
  fieldToColumn: Map<CanonicalField, string>;
  /** Log messages detailing conflict resolutions */
  logs: string[];
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
    { alias: "eventtime", priority: 75 },
    { alias: "event_time", priority: 75 },
    { alias: "logtime", priority: 70 },
    { alias: "log_time", priority: 70 },
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
    { alias: "activityid", priority: 70 },
    { alias: "type", priority: 60 },
    { alias: "id", priority: 50 },
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

  // Group candidate matches by canonical field
  const candidatesByField = new Map<CanonicalField, CandidateMatch[]>();

  for (let i = 0; i < headers.length; i++) {
    const rawHeader = headers[i];
    const normalized = normalizeHeader(rawHeader);
    if (!normalized) continue;

    for (const [canonicalKey, aliasDefs] of Object.entries(ALIAS_DEFINITIONS) as [
      CanonicalField,
      AliasDefinition[]
    ][]) {
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
    if (candidates.length === 0) continue;

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
