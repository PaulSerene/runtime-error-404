import { runSns } from "../lib/run.ts";

runSns(["--sync", "--targets", "tabnews", ...process.argv.slice(2)]).catch(
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
