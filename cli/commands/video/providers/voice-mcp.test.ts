// Regression tests for the MCP-first Voicebox voice path (voicebox_speak /
// voicebox_transcribe over Streamable HTTP) and its REST fallback.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cli/io/http", () => ({
  http: { get: vi.fn(), post: vi.fn() },
}));

import { http } from "@cli/io/http";
import { VoiceboxVoiceProvider } from "./voice.js";

const BASE = "http://127.0.0.1:17493";
const MCP_URL = `${BASE}/mcp`;

const httpGet = vi.mocked(http.get);
const httpPost = vi.mocked(http.post);

const LINES = [{ sceneId: "scene-01", text: "one two" }];
const OPTS = { voice: "test-profile", locale: "en" };

const SEGMENTS = [
  {
    start: 0,
    end: 2,
    words: [
      { word: "one", start: 0, end: 1 },
      { word: "two", start: 1, end: 2 },
    ],
  },
];

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return {
    status: 200,
    data: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  };
}

/** Route GET /health and GET /audio/{id}. */
function mockGets() {
  httpGet.mockImplementation(async (url: string) => {
    if (url.endsWith("/health")) return { status: 200, data: "ok" };
    if (url.includes("/audio/")) {
      return { status: 200, data: new Uint8Array([82, 73, 70, 70]).buffer };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

describe("VoiceboxVoiceProvider MCP path", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "oma-voice-mcp-"));
    delete process.env.OMA_VIDEO_MOCK;
    vi.clearAllMocks();
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("synthesizes via MCP tools without touching the REST speak/transcribe endpoints", async () => {
    mockGets();
    const seenSessionHeaders: Array<string | undefined> = [];
    httpPost.mockImplementation(
      async (url: string, body: unknown, config?: AxiosRequestConfig) => {
        if (url !== MCP_URL) throw new Error(`unexpected POST ${url}`);
        const rpc = body as { method?: string; id?: number };
        const headers = config?.headers as
          | Record<string, string | undefined>
          | undefined;
        seenSessionHeaders.push(headers?.["mcp-session-id"]);
        if (rpc.method === "initialize") {
          return jsonResponse(
            {
              jsonrpc: "2.0",
              id: rpc.id,
              result: { protocolVersion: "2024-11-05" },
            },
            { "mcp-session-id": "session-1" },
          );
        }
        if (rpc.method === "notifications/initialized") {
          return { status: 202, data: "", headers: {} };
        }
        const params = (rpc as { params?: { name?: string } }).params;
        if (params?.name === "voicebox_speak") {
          // structuredContent path (plain JSON body).
          return jsonResponse({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              content: [{ type: "text", text: "generated" }],
              structuredContent: { generation_id: "gen-1" },
            },
          });
        }
        if (params?.name === "voicebox_transcribe") {
          // text-content path delivered as an SSE stream.
          const message = JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              content: [
                { type: "text", text: JSON.stringify({ segments: SEGMENTS }) },
              ],
            },
          });
          return {
            status: 200,
            data: `event: message\ndata: ${message}\n\n`,
            headers: { "content-type": "text/event-stream" },
          };
        }
        throw new Error(`unexpected MCP call ${JSON.stringify(rpc)}`);
      },
    );

    const provider = new VoiceboxVoiceProvider(BASE);
    const { audio, timing } = await provider.synthesize(LINES, {
      runDir: tmp,
      ...OPTS,
    });

    expect(audio.path).toBe(path.join("audio", "narration-01.wav"));
    expect(existsSync(path.join(tmp, audio.path))).toBe(true);
    expect(timing.source).toBe("voicebox-stt");
    expect(timing.totalSec).toBe(2);
    expect(timing.segments[0]?.sceneId).toBe("scene-01");
    expect(timing.segments[0]?.words).toEqual([
      { t: "one", startSec: 0, endSec: 1 },
      { t: "two", startSec: 1, endSec: 2 },
    ]);
    // REST speak/transcribe endpoints must not be hit on the MCP path.
    const postedUrls = httpPost.mock.calls.map((call) => call[0]);
    expect(postedUrls).not.toContain(`${BASE}/speak`);
    expect(postedUrls).not.toContain(`${BASE}/transcribe`);
    // The session id from initialize is echoed on subsequent MCP calls.
    expect(seenSessionHeaders[0]).toBeUndefined();
    expect(seenSessionHeaders.slice(1)).toEqual(
      Array(seenSessionHeaders.length - 1).fill("session-1"),
    );
  });

  it("falls back to the REST endpoints when the MCP surface is unavailable", async () => {
    mockGets();
    httpPost.mockImplementation(async (url: string) => {
      if (url === MCP_URL) throw new Error("connect ECONNREFUSED");
      if (url === `${BASE}/speak`) {
        return {
          status: 200,
          data: { generation_id: "gen-rest" },
          headers: {},
        };
      }
      if (url === `${BASE}/transcribe`) {
        return { status: 200, data: { segments: SEGMENTS }, headers: {} };
      }
      throw new Error(`unexpected POST ${url}`);
    });

    const provider = new VoiceboxVoiceProvider(BASE);
    const { audio, timing } = await provider.synthesize(LINES, {
      runDir: tmp,
      ...OPTS,
    });

    expect(audio.path).toBe(path.join("audio", "narration-01.wav"));
    expect(timing.source).toBe("voicebox-stt");
    expect(timing.segments[0]?.words).toHaveLength(2);
    const postedUrls = httpPost.mock.calls.map((call) => call[0]);
    expect(postedUrls).toContain(`${BASE}/speak`);
    expect(postedUrls).toContain(`${BASE}/transcribe`);
  });

  it("falls back to REST transcription when the MCP tool reports an error", async () => {
    mockGets();
    httpPost.mockImplementation(async (url: string, body?: unknown) => {
      if (url === MCP_URL) {
        const rpc = body as { method?: string; id?: number };
        if (rpc.method === "initialize") {
          return jsonResponse({ jsonrpc: "2.0", id: rpc.id, result: {} });
        }
        if (rpc.method === "notifications/initialized") {
          return { status: 202, data: "", headers: {} };
        }
        const params = (rpc as { params?: { name?: string } }).params;
        if (params?.name === "voicebox_speak") {
          return jsonResponse({
            jsonrpc: "2.0",
            id: rpc.id,
            result: { structuredContent: { generation_id: "gen-1" } },
          });
        }
        // voicebox_transcribe → tool-level error (isError).
        return jsonResponse({
          jsonrpc: "2.0",
          id: rpc.id,
          result: {
            isError: true,
            content: [{ type: "text", text: "model not loaded" }],
          },
        });
      }
      if (url === `${BASE}/transcribe`) {
        return { status: 200, data: { segments: SEGMENTS }, headers: {} };
      }
      throw new Error(`unexpected POST ${url}`);
    });

    const provider = new VoiceboxVoiceProvider(BASE);
    const { timing } = await provider.synthesize(LINES, {
      runDir: tmp,
      ...OPTS,
    });

    expect(timing.source).toBe("voicebox-stt");
    expect(timing.totalSec).toBe(2);
    const postedUrls = httpPost.mock.calls.map((call) => call[0]);
    expect(postedUrls).toContain(`${BASE}/transcribe`);
    expect(postedUrls).not.toContain(`${BASE}/speak`);
  });
});
