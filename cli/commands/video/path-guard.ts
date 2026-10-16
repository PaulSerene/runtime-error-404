import path from "node:path";
import { ensureRunDirWithinCwd } from "../../utils/run-dir.js";
import { renderPattern, type VideoRunId } from "./naming.js";

export interface ResolveVideoRunDirArgs {
  outFlag?: string;
  allowExternal: boolean;
  defaultBase: string;
  runId: VideoRunId;
  singleFolderPattern: string;
  cwd?: string;
}

export function resolveVideoRunDir(args: ResolveVideoRunDirArgs): string {
  const cwd = args.cwd ?? process.cwd();
  const base = args.outFlag
    ? path.resolve(cwd, args.outFlag)
    : path.resolve(cwd, args.defaultBase);
  const resolved = path.resolve(
    base,
    renderPattern(args.singleFolderPattern, {
      timestamp: args.runId.timestamp,
      shortid: args.runId.shortid,
      mode: args.runId.mode,
    }),
  );

  return ensureRunDirWithinCwd({
    resolved,
    cwd,
    allowExternal: args.allowExternal,
    outFlag: args.outFlag,
  });
}
