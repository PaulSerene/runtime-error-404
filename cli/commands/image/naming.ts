import { formatTimestamp, shortId } from "../../utils/run-naming.js";

export {
  formatTimestamp,
  renderPattern,
  shortId,
} from "../../utils/run-naming.js";

export function makeRunId(date = new Date()): {
  timestamp: string;
  shortid: string;
} {
  return { timestamp: formatTimestamp(date), shortid: shortId() };
}

// Sanitize a model name for safe use in filenames:
// - strip path separators and any non-[alnum._-] characters
// - collapse dot-runs (".." or more) to "_" so no traversal sequence survives
// - collapse runs of replacement underscores
export function sanitizeModelForFilename(model: string): string {
  const cleaned = model
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/_+/g, "_");
  return cleaned.length > 0 ? cleaned : "model";
}

export interface OutputNameArgs {
  vendor: string;
  model?: string;
  runShortid: string;
  index?: number;
  total: number;
  ext: string;
}

export function buildOutputFilename(args: OutputNameArgs): string {
  const modelSegment =
    args.model && args.model.length > 0
      ? `-${sanitizeModelForFilename(args.model)}`
      : "";
  const base = `${args.vendor}${modelSegment}-${args.runShortid}`;
  const suffix = args.total > 1 ? `-${(args.index ?? 0) + 1}` : "";
  return `${base}${suffix}.${args.ext}`;
}
