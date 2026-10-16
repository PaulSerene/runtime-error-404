import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerExplainCommand } from "./command.js";
import { runExplainValidate, validateHtmlContent } from "./validate.js";

describe("Explain HTML Validation (`oma explain validate`)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oma-explain-test-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("passes validation for a valid self-contained explain HTML report", async () => {
    const validHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Valid Report</title>
  <style>
    pre { white-space: pre-wrap; background: #eee; }
  </style>
</head>
<body>
  <h1>Valid Report</h1>
  <pre><code>console.log("hello world");</code></pre>
  <script>
    const quiz = { questions: [], score: 0 };
    function checkAnswer() { return true; }
  </script>
</body>
</html>`;

    const filePath = path.join(tmpDir, "2026-07-23-valid-report.html");
    fs.writeFileSync(filePath, validHtml, "utf-8");

    const code = await runExplainValidate({ file: filePath, format: "json" });
    expect(code).toBe(0);
  });

  it("fails validation when live external scripts/styles are loaded", async () => {
    const invalidHtml = `<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.example.com/library.js"></script>
</head>
<body>
  <pre><code>test</code></pre>
  <script>const quiz = { score: 0 }; function checkAnswer(){}</script>
</body>
</html>`;

    const filePath = path.join(tmpDir, "2026-07-23-external-script.html");
    fs.writeFileSync(filePath, invalidHtml, "utf-8");

    const res = validateHtmlContent(filePath, invalidHtml);
    expect(res.valid).toBe(false);
    expect(res.issues).toContainEqual(
      expect.objectContaining({
        rule: "self-contained",
        severity: "error",
      }),
    );

    const code = await runExplainValidate({ file: filePath, format: "json" });
    expect(code).toBe(1);
  });

  it("fails validation when live external images or media are loaded", async () => {
    const mediaHtml = `<!DOCTYPE html>
<html>
<head><title>External Image</title></head>
<body>
  <img src="https://example.com/logo.png" />
  <pre><code>test</code></pre>
  <script>const quiz = { score: 0, checkAnswer(){} };</script>
</body>
</html>`;

    const filePath = path.join(tmpDir, "2026-07-23-external-img.html");
    fs.writeFileSync(filePath, mediaHtml, "utf-8");

    const res = validateHtmlContent(filePath, mediaHtml);
    expect(res.valid).toBe(false);
    expect(res.issues).toContainEqual(
      expect.objectContaining({
        rule: "self-contained",
        severity: "error",
      }),
    );
  });

  it("ignores external resource and secret false positives inside <pre> code containers", async () => {
    const htmlWithPreExamples = `<!DOCTYPE html>
<html>
<head>
  <style>body { font-family: sans-serif; }</style>
</head>
<body>
  <pre>
    <code>
      &lt;script src="http://example.com/external.js"&gt;&lt;/script&gt;
      const apiKey = "sk-123456789012345678901234567890";
    </code>
  </pre>
  <script>
    const quiz = { questions: [], checkAnswer() { return true; } };
  </script>
</body>
</html>`;

    const filePath = path.join(tmpDir, "2026-07-23-pre-examples.html");
    fs.writeFileSync(filePath, htmlWithPreExamples, "utf-8");

    const res = validateHtmlContent(filePath, htmlWithPreExamples);
    expect(res.valid).toBe(true);
    expect(res.issues.filter((i) => i.rule === "self-contained")).toHaveLength(
      0,
    );
    expect(res.issues.filter((i) => i.rule === "secret-scan")).toHaveLength(0);

    const code = await runExplainValidate({
      file: filePath,
      format: "concise",
    });
    expect(code).toBe(0);
  });

  it("fails validation when pre formatting is missing", async () => {
    const htmlMissingPre = `<!DOCTYPE html>
<html>
<head><title>No Pre</title></head>
<body>
  <div>Just text without pre container</div>
  <script>const quiz = { score: 0, checkAnswer(){} };</script>
</body>
</html>`;

    const filePath = path.join(tmpDir, "2026-07-23-missing-pre.html");
    fs.writeFileSync(filePath, htmlMissingPre, "utf-8");

    const res = validateHtmlContent(filePath, htmlMissingPre);
    expect(res.valid).toBe(false);
    expect(res.issues).toContainEqual(
      expect.objectContaining({
        rule: "code-container-compliance",
        severity: "error",
      }),
    );

    const code = await runExplainValidate({ file: filePath });
    expect(code).toBe(1);
  });

  it("fails validation when an unquoted secret or password is exposed outside code blocks", async () => {
    const htmlWithUnquotedSecret = `<!DOCTYPE html>
<html>
<head><title>Unquoted Password</title></head>
<body>
  <pre><code>code block</code></pre>
  <script>
    const password = mysecretpassword123456;
    const quiz = { score: 0, checkAnswer(){} };
  </script>
</body>
</html>`;

    const filePath = path.join(tmpDir, "2026-07-23-unquoted-secret.html");
    fs.writeFileSync(filePath, htmlWithUnquotedSecret, "utf-8");

    const res = validateHtmlContent(filePath, htmlWithUnquotedSecret);
    expect(res.valid).toBe(false);
    expect(res.issues).toContainEqual(
      expect.objectContaining({
        rule: "secret-scan",
        severity: "error",
      }),
    );
  });

  it("safely handles directory scanning with circular symlinks without infinite recursion", async () => {
    const subDir = path.join(tmpDir, "subdir");
    fs.mkdirSync(subDir, { recursive: true });

    const validHtml = `<!DOCTYPE html>
<html>
<head><title>Symlink Test</title></head>
<body>
  <pre><code>test</code></pre>
  <script>const quiz = { score: 0, checkAnswer(){} };</script>
</body>
</html>`;
    fs.writeFileSync(
      path.join(subDir, "2026-07-23-symlink-test.html"),
      validHtml,
    );

    // Create circular symlink pointing to parent
    try {
      fs.symlinkSync(tmpDir, path.join(subDir, "circular-link"), "dir");
    } catch {
      // Ignore OS symlink permission constraints if restricted
    }

    const code = await runExplainValidate({ dir: tmpDir, format: "json" });
    expect(code).toBe(0);
  });

  it("executes CLI subcommand `oma explain validate` with --json flag", async () => {
    const validHtml = `<!DOCTYPE html>
<html>
<head><title>CLI Test</title></head>
<body>
  <pre><code>test</code></pre>
  <script>const quiz = { questions: [], score: 0, checkAnswer(){} };</script>
</body>
</html>`;

    const filePath = path.join(tmpDir, "2026-07-23-cli-json-test.html");
    const outFile = path.join(tmpDir, "out", "report.json");
    fs.writeFileSync(filePath, validHtml, "utf-8");

    const program = new Command();
    program.exitOverride();
    registerExplainCommand(program);

    await program.parseAsync([
      "node",
      "oma",
      "explain",
      "validate",
      filePath,
      "--json",
      "--out-file",
      outFile,
    ]);

    expect(fs.existsSync(outFile)).toBe(true);
    const reportData = JSON.parse(fs.readFileSync(outFile, "utf-8"));
    expect(reportData.valid).toBe(true);
    expect(reportData.totalFiles).toBe(1);
  });
});
