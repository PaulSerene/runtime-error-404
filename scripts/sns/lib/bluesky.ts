import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type AgentVendor, runAgent } from "../../utils/agent-spawn.ts";
import { parseAgentJson, withParseRetry } from "./agent-json.ts";
import type { BlueskyPost, EnglishDraft, SkipPayload } from "./types.ts";

const GITHUB_URL = "https://github.com/first-fluke/oh-my-agent";
const DEFAULT_SERVICE = "https://bsky.social";
// Bluesky enforces a 300-grapheme limit on post text.
const MAX_GRAPHEMES = 300;

function blueskyCredentials(): { identifier: string; password: string } {
  const identifier = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) {
    throw new Error(
      "BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set. Create an app password at https://bsky.app/settings/app-passwords and export them in ~/.zshenv or your shell rc.",
    );
  }
  return { identifier, password };
}

function blueskyService(): string {
  return process.env.BLUESKY_SERVICE ?? DEFAULT_SERVICE;
}

function blueskyDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../bluesky");
}

function readSoul(): string {
  return readFileSync(resolve(blueskyDir(), "SOUL.md"), "utf8");
}

/** Count visible characters (graphemes), matching how Bluesky measures length. */
export function graphemeLength(text: string): number {
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter })
    .Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter(undefined, { granularity: "grapheme" });
    let count = 0;
    for (const _ of segmenter.segment(text)) count += 1;
    return count;
  }
  // Fallback: code points (still better than UTF-16 code units).
  return [...text].length;
}

/** Strip markdown to a short plain-text blurb for the link card description. */
function cardDescription(bodyMarkdown: string): string {
  const plain = bodyMarkdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>#-]+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 280 ? `${plain.slice(0, 277)}...` : plain;
}

export function buildAnnouncePrompt(
  soul: string,
  english: EnglishDraft,
  url: string,
): string {
  return [
    "Write a short Bluesky post announcing the dev.to article below.",
    "Follow the author voice guide EXACTLY. This is a micro-post, not an article.",
    "",
    "## Author voice guide (SOUL.md)",
    soul,
    "",
    "## Article being announced",
    `title: ${english.title}`,
    `tags: ${english.tags.join(", ")}`,
    `dev.to url (do NOT paste in the text; a link card is attached): ${url}`,
    `project: ${GITHUB_URL}`,
    "",
    "## Article body (for context only — summarize, do not copy)",
    english.body_markdown,
    "",
    "## Output requirements",
    "- Output JSON ONLY (no markdown fence, no commentary).",
    '- Schema: { "text": string }.',
    `- text must be at most ${MAX_GRAPHEMES} graphemes (aim for 200-280).`,
    "- Do not include the raw URL in text; the link card carries it.",
    "- Do not use em-dashes.",
    '- If there is nothing worth announcing, return { "skip": true, "reason": "<one line>" }.',
  ].join("\n");
}

export function prepareAnnouncePrompt(
  english: EnglishDraft,
  url: string,
): string {
  return buildAnnouncePrompt(readSoul(), english, url);
}

export function parseAnnouncePost(raw: string): BlueskyPost | SkipPayload {
  const parsed = parseAgentJson(raw);
  if (parsed.skip === true) {
    return { skip: true, reason: String(parsed.reason ?? "skipped") };
  }
  if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
    throw new Error("Agent output missing required field (text).");
  }
  const text = parsed.text.trim();
  const length = graphemeLength(text);
  if (length > MAX_GRAPHEMES) {
    throw new Error(
      `Bluesky announce exceeds ${MAX_GRAPHEMES} graphemes (got ${length}).`,
    );
  }
  return { text };
}

export function generateBlueskyAnnounce(
  english: EnglishDraft,
  url: string,
  vendor?: AgentVendor,
  prompt?: string,
): BlueskyPost | SkipPayload {
  const resolved = prompt ?? prepareAnnouncePrompt(english, url);
  return withParseRetry(
    () => runAgent({ vendor, prompt: resolved }),
    parseAnnouncePost,
    {
      attempts: 3,
      onRetry: (n, total, err) =>
        console.warn(
          `[bluesky] announce output unparseable (attempt ${n}/${total}): ${err.message}; retrying`,
        ),
    },
  );
}

interface TagFacet {
  index: { byteStart: number; byteEnd: number };
  features: { $type: "app.bsky.richtext.facet#tag"; tag: string }[];
}

function utf8Len(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Build richtext facets so `#hashtags` in the post become real, clickable and
 * searchable Bluesky tags instead of plain text. Facet offsets are UTF-8 byte
 * ranges over the post text, matching the AT Protocol richtext spec.
 */
export function detectTagFacets(text: string): TagFacet[] {
  const facets: TagFacet[] = [];
  const re = /(^|\s)(#[^\s#]+)/g;
  for (const match of text.matchAll(re)) {
    const lead = match[1] ?? "";
    const token = (match[2] ?? "").replace(/[.,!?;:'")\]}]+$/u, "");
    const tag = token.slice(1);
    if (!tag || /^\d+$/.test(tag) || tag.length > 64) continue;
    const hashStart = (match.index ?? 0) + lead.length;
    const byteStart = utf8Len(text.slice(0, hashStart));
    facets.push({
      index: { byteStart, byteEnd: byteStart + utf8Len(token) },
      features: [{ $type: "app.bsky.richtext.facet#tag", tag }],
    });
  }
  return facets;
}

interface BlueskySession {
  accessJwt: string;
  did: string;
  handle: string;
}

async function createSession(): Promise<BlueskySession> {
  const { identifier, password } = blueskyCredentials();
  const response = await fetch(
    `${blueskyService()}/xrpc/com.atproto.server.createSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Bluesky createSession ${response.status}: ${await response.text()}`,
    );
  }
  const json = (await response.json()) as {
    accessJwt?: string;
    did?: string;
    handle?: string;
  };
  if (!json.accessJwt || !json.did) {
    throw new Error("Bluesky createSession returned no accessJwt/did.");
  }
  return {
    accessJwt: json.accessJwt,
    did: json.did,
    handle: json.handle ?? identifier,
  };
}

/**
 * Post an announce to Bluesky with an external link card pointing at the
 * dev.to article. Bluesky has no draft concept, so this always publishes;
 * callers gate on `--force`.
 */
export async function publishToBluesky(
  post: BlueskyPost,
  link: { uri: string; title: string; description: string },
): Promise<{ uri: string; url?: string }> {
  const session = await createSession();
  const facets = detectTagFacets(post.text);
  const record = {
    $type: "app.bsky.feed.post",
    text: post.text,
    createdAt: new Date().toISOString(),
    ...(facets.length > 0 ? { facets } : {}),
    embed: {
      $type: "app.bsky.embed.external",
      external: {
        uri: link.uri,
        title: link.title.slice(0, 300),
        description: link.description.slice(0, 1000),
      },
    },
  };
  const response = await fetch(
    `${blueskyService()}/xrpc/com.atproto.repo.createRecord`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Bluesky createRecord ${response.status}: ${await response.text()}`,
    );
  }
  const json = (await response.json()) as { uri?: string; cid?: string };
  if (!json.uri) {
    throw new Error("Bluesky createRecord returned no uri.");
  }
  // at://did/app.bsky.feed.post/<rkey> -> https://bsky.app/profile/<handle>/post/<rkey>
  const rkey = json.uri.split("/").pop();
  const url = rkey
    ? `https://bsky.app/profile/${session.handle}/post/${rkey}`
    : undefined;
  return { uri: json.uri, url };
}

export function announceLink(
  english: EnglishDraft,
  url: string,
): { uri: string; title: string; description: string } {
  return {
    uri: url,
    title: english.title,
    description: cardDescription(english.body_markdown),
  };
}
