import * as p from "@clack/prompts";
import pc from "picocolors";
import { isGhAuthenticated } from "../../io/github.js";
import { VENDORS } from "../../vendors/index.js";

// GitHub is not a vendor (separate gh CLI); its hint lives here. Per-vendor
// login hints are co-located on each Vendor descriptor (vendors/index.ts).
const GITHUB_AUTH_HINT = "gh auth login";

export async function checkAuthStatus(jsonMode = false): Promise<void> {
  const github = isGhAuthenticated();
  const statuses = Object.fromEntries(
    VENDORS.map((v) => [v.id, v.isAuthenticated()]),
  ) as Record<string, boolean>;

  const results = { github, ...statuses };

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  p.intro(pc.bgMagenta(pc.white(" 🔐 oh-my-agent auth status ")));

  const icon = (auth: boolean) => (auth ? "✅" : "❌");
  const label = (auth: boolean) =>
    auth ? pc.green("Authenticated") : pc.red("Not Authenticated");

  const rows: [string, boolean][] = [
    ["GitHub", github],
    ...VENDORS.map(
      (v) => [v.label, statuses[v.id] ?? false] as [string, boolean],
    ),
  ];

  p.note(
    rows
      .map(([name, auth]) => `${icon(auth)} ${name.padEnd(12)} ${label(auth)}`)
      .join("\n"),
    "Authentication Status",
  );

  const missing = rows
    .filter(([, auth]) => !auth)
    .map(([name]) => {
      const hint =
        name === "GitHub"
          ? GITHUB_AUTH_HINT
          : VENDORS.find((v) => v.label === name)?.authHint;
      return hint ? ([name, hint] as const) : undefined;
    })
    .filter((hint): hint is readonly [string, string] => !!hint);

  if (missing.length === 0) {
    p.outro(pc.green("All configured CLIs are authenticated."));
    return;
  }

  p.outro(
    `Login hints: ${missing
      .map(([name, command]) => `${name}: ${pc.cyan(command)}`)
      .join("; ")}`,
  );
}
