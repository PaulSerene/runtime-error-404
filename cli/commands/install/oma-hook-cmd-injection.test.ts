/**
 * Security regression tests for buildOmaHookCmd shell-metacharacter injection.
 *
 * A malicious project's `.agents/hooks/variants/*.json` could embed shell
 * metacharacters in `vendor`, `nativeEvent`, or `matcher` fields. After the
 * fix, every value is wrapped in POSIX single-quotes so metacharacters are
 * inert in the generated settings `command` string.
 *
 * The key invariant: each argument value appears as a single-quoted token.
 * The tests verify:
 *   (a) the value IS present inside single-quotes (correct quoting applied), and
 *   (b) the value does NOT appear as a bare (unquoted) token immediately after
 *       the flag name — i.e., `--vendor codex;` (space then unquoted) is absent.
 */
import { describe, expect, it } from "vitest";
import {
  buildOmaHookCmd,
  type HookVariant,
} from "../../platform/hooks-composer.js";

/** Minimal variant fixture with no projectDirEnv (Codex-style). */
function makeVariant(overrides: Partial<HookVariant> = {}): HookVariant {
  return {
    vendor: "codex",
    hookDir: ".codex/hooks",
    settingsFile: ".codex/hooks.json",
    projectDirEnv: null,
    runtime: "bun",
    events: {},
    ...overrides,
  };
}

describe("buildOmaHookCmd — shell-injection prevention", () => {
  it("single-quotes a vendor containing semicolons so the payload is inert", () => {
    const variant = makeVariant({ vendor: "codex; rm -rf ~" });
    const cmd = buildOmaHookCmd(variant, "UserPromptSubmit");

    // The dangerous string must appear as a single-quoted literal.
    expect(cmd).toContain("'codex; rm -rf ~'");
    // The unquoted flag+value form must NOT appear (the semicolon would start a new command).
    expect(cmd).not.toMatch(/--vendor codex;/);
  });

  it("single-quotes a nativeEvent containing shell metacharacters", () => {
    const variant = makeVariant();
    const cmd = buildOmaHookCmd(variant, "UserPromptSubmit; rm -rf ~");

    // The dangerous string must appear as a single-quoted literal.
    expect(cmd).toContain("'UserPromptSubmit; rm -rf ~'");
    // The unquoted form (flag followed immediately by unquoted value) must not appear.
    expect(cmd).not.toMatch(/--event UserPromptSubmit;/);
  });

  it("single-quotes a matcher containing command-substitution metacharacters", () => {
    const variant = makeVariant();
    const cmd = buildOmaHookCmd(
      variant,
      "PreToolUse",
      "Bash$(touch /tmp/pwned)",
    );

    // The dangerous string must appear as a single-quoted literal.
    expect(cmd).toContain("'Bash$(touch /tmp/pwned)'");
    // The unquoted form (where $() would be expanded) must not appear.
    expect(cmd).not.toMatch(/--matcher Bash\$/);
  });

  it("preserves a legitimate pipe-separated matcher value inside single-quotes", () => {
    const variant = makeVariant();
    const cmd = buildOmaHookCmd(variant, "PreToolUse", "Edit|Write");

    // The pipe character is legitimate and must be preserved, inside quotes.
    expect(cmd).toContain("--matcher 'Edit|Write'");
    // The unquoted form would be interpreted as a shell pipe.
    expect(cmd).not.toMatch(/--matcher Edit\|/);
  });

  it("wraps all three positional values in single-quotes for a clean variant", () => {
    const variant = makeVariant({ vendor: "claude" });
    const cmd = buildOmaHookCmd(variant, "UserPromptSubmit", "Bash");

    expect(cmd).toContain("--vendor 'claude'");
    expect(cmd).toContain("--event 'UserPromptSubmit'");
    expect(cmd).toContain("--matcher 'Bash'");
  });

  it("escapes an embedded single-quote inside a value via POSIX quoting", () => {
    const variant = makeVariant({ vendor: "evil'vendor" });
    const cmd = buildOmaHookCmd(variant, "UserPromptSubmit");

    // The embedded quote must be escaped: POSIX form is 'evil'\''vendor'
    expect(cmd).toContain("'evil'\\''vendor'");
    // A raw unescaped closing quote followed by non-backslash must not appear.
    expect(cmd).not.toMatch(/--vendor 'evil'[^\\]/);
  });

  it("does not include --matcher when matcher is undefined", () => {
    const variant = makeVariant();
    const cmd = buildOmaHookCmd(variant, "Stop");

    expect(cmd).not.toContain("--matcher");
  });

  it("uses projectDirEnv expansion in the wrapper path while still quoting args", () => {
    const variant = makeVariant({
      vendor: "claude",
      hookDir: ".claude/hooks",
      projectDirEnv: "CLAUDE_PROJECT_DIR",
    });
    const cmd = buildOmaHookCmd(
      variant,
      "UserPromptSubmit; echo pwned",
      "Bash",
    );

    // The path still uses the env var expansion (machine-independent).
    expect(cmd).toContain("$CLAUDE_PROJECT_DIR");
    // The malicious event is quoted (literal string, inert to shell).
    expect(cmd).toContain("'UserPromptSubmit; echo pwned'");
    // The injection does not appear in an unquoted flag+value position.
    expect(cmd).not.toMatch(/--event UserPromptSubmit;/);
  });
});
