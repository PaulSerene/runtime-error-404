import path from "node:path";
import { ensureRunDirWithinCwd } from "../../utils/run-dir.js";
import { renderPattern } from "./naming.js";

export interface ResolveOutDirArgs {
  outFlag?: string;
  allowExternal: boolean;
  defaultBase: string;
  runId: { timestamp: string; shortid: string };
  compare: boolean;
  singleFolderPattern: string;
  compareFolderPattern: string;
  cwd?: string;
}

export function resolveOutDir(args: ResolveOutDirArgs): string {
  const cwd = args.cwd ?? process.cwd();
  const folderPattern = args.compare
    ? args.compareFolderPattern
    : args.singleFolderPattern;
  const resolved = args.outFlag
    ? path.resolve(cwd, args.outFlag)
    : path.resolve(
        cwd,
        args.defaultBase,
        renderPattern(folderPattern, args.runId),
      );

  return ensureRunDirWithinCwd({
    resolved,
    cwd,
    allowExternal: args.allowExternal,
    outFlag: args.outFlag,
  });
}
