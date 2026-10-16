import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cursorWorkspaceChatHash, sha256Hex, shortHash } from "./hash.js";

describe("sha256Hex", () => {
  const helloDigest =
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

  it("hashes utf-8 strings", () => {
    expect(sha256Hex("hello")).toBe(helloDigest);
  });

  it("hashes buffers", () => {
    expect(sha256Hex(Buffer.from("hello"))).toBe(helloDigest);
  });
});

describe("shortHash", () => {
  it("returns 16 hex chars", () => {
    expect(shortHash({ a: 1 })).toMatch(/^[a-f0-9]{16}$/);
  });

  it("is deterministic for the same serialized value", () => {
    expect(shortHash({ a: 1, b: 2 })).toBe(shortHash({ a: 1, b: 2 }));
  });

  it("differs from raw string hashing (JSON envelope)", () => {
    expect(shortHash("x")).not.toBe(
      createHash("sha256").update("x").digest("hex").slice(0, 16),
    );
  });
});

describe("cursorWorkspaceChatHash", () => {
  it("matches MD5 hex of workspace path", () => {
    expect(cursorWorkspaceChatHash("/tmp/proj")).toMatch(/^[a-f0-9]{32}$/);
  });
});
