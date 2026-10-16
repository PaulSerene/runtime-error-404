import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateSerenaProjectFromCwd } from "./015-serena-project-from-cwd.js";

const tempRoots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "oma-migrate-015-"));
  tempRoots.push(root);
  return root;
}

function writeJson(root: string, rel: string[], value: unknown): string {
  const dir = join(root, ...rel.slice(0, -1));
  mkdirSync(dir, { recursive: true });
  const path = join(root, ...rel);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  return path;
}

function serenaEntry(args: string[]) {
  return {
    mcpServers: {
      serena: { command: "serena", args, env: { SERENA_LOG_LEVEL: "info" } },
    },
  };
}

afterEach(() => {
  for (const r of tempRoots) rmSync(r, { recursive: true, force: true });
  tempRoots.length = 0;
});

describe("migrateSerenaProjectFromCwd (015)", () => {
  it("rewrites --project . to --project-from-cwd across json configs", () => {
    const root = makeRoot();
    const stale = ["start-mcp-server", "--context", "ide", "--project", "."];
    const mcp = writeJson(root, [".mcp.json"], serenaEntry([...stale]));
    const agents = writeJson(
      root,
      [".agents", "mcp.json"],
      serenaEntry([...stale]),
    );
    const qwen = writeJson(
      root,
      [".qwen", "settings.json"],
      serenaEntry([...stale]),
    );

    const actions = migrateSerenaProjectFromCwd.up(root);

    expect(actions.length).toBe(3);
    for (const path of [mcp, agents, qwen]) {
      const parsed = JSON.parse(readFileSync(path, "utf-8"));
      expect(parsed.mcpServers.serena.args).toEqual([
        "start-mcp-server",
        "--context",
        "ide",
        "--project-from-cwd",
      ]);
      // Mutually exclusive — never leaves both flags.
      expect(parsed.mcpServers.serena.args).not.toContain("--project");
    }
  });

  it("rewrites the Antigravity-derived .agents/mcp_config.json", () => {
    const root = makeRoot();
    const path = writeJson(
      root,
      [".agents", "mcp_config.json"],
      serenaEntry([
        "start-mcp-server",
        "--context",
        "antigravity",
        "--project",
        ".",
        "--open-web-dashboard",
        "false",
      ]),
    );

    migrateSerenaProjectFromCwd.up(root);

    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    expect(parsed.mcpServers.serena.args).toEqual([
      "start-mcp-server",
      "--context",
      "antigravity",
      "--project-from-cwd",
      "--open-web-dashboard",
      "false",
    ]);
  });

  it("rewrites the codex config.toml serena entry", () => {
    const root = makeRoot();
    mkdirSync(join(root, ".codex"), { recursive: true });
    const path = join(root, ".codex", "config.toml");
    writeFileSync(
      path,
      [
        "[mcp_servers.serena]",
        'command = "serena"',
        'args = ["start-mcp-server", "--context", "codex", "--project", "."]',
        "",
      ].join("\n"),
      "utf-8",
    );

    const actions = migrateSerenaProjectFromCwd.up(root);

    expect(actions.some((a) => a.startsWith(".codex/config.toml"))).toBe(true);
    const toml = readFileSync(path, "utf-8");
    expect(toml).toContain("--project-from-cwd");
    expect(toml).not.toMatch(/"--project"\s*,\s*"\."/);
  });

  it("is idempotent — no action when already --project-from-cwd", () => {
    const root = makeRoot();
    const path = writeJson(
      root,
      [".mcp.json"],
      serenaEntry([
        "start-mcp-server",
        "--context",
        "ide",
        "--project-from-cwd",
      ]),
    );
    const before = readFileSync(path, "utf-8");

    const actions = migrateSerenaProjectFromCwd.up(root);

    expect(actions).toHaveLength(0);
    expect(readFileSync(path, "utf-8")).toBe(before);
  });

  it("ignores non-serena entries and missing files", () => {
    const root = makeRoot();
    writeJson(root, [".mcp.json"], {
      mcpServers: { other: { command: "node", args: ["--project", "."] } },
    });

    expect(migrateSerenaProjectFromCwd.up(root)).toHaveLength(0);
  });
});
