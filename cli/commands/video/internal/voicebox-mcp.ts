// Minimal MCP client for the local Voicebox server (design 013 §5).
//
// Voicebox exposes its tools over MCP Streamable HTTP at `<base>/mcp`
// (voicebox_speak / voicebox_transcribe — see oma-voice SKILL.md "MCP tool
// mapping"). This client implements exactly the slice the video voice provider
// needs — initialize → notifications/initialized → tools/call — over the
// shared axios instance, handling both plain-JSON and SSE response bodies.
// Loopback only; no credentials.
import { http } from "@cli/io/http";

const MCP_PROTOCOL_VERSION = "2024-11-05";

/** Parsed result of a tools/call: structured payload preferred, text second. */
export interface VoiceboxToolResult {
  structured?: unknown;
  text?: string;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

export class VoiceboxMcpClient {
  private sessionId: string | undefined;
  private initialized = false;
  private nextId = 1;

  constructor(
    private readonly mcpUrl: string,
    private readonly timeoutMs: number = 60_000,
  ) {}

  /** Call an MCP tool; throws on transport, protocol, or tool errors. */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<VoiceboxToolResult> {
    await this.ensureInitialized();
    const response = await this.request({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    });
    if (response.error) {
      throw new Error(
        `voicebox mcp ${name}: ${response.error.message ?? "rpc error"}`,
      );
    }
    const result = response.result;
    if (!result) throw new Error(`voicebox mcp ${name}: empty result`);
    const text = result.content?.find((item) => item.type === "text")?.text;
    if (result.isError) {
      throw new Error(`voicebox mcp ${name}: ${text ?? "tool error"}`);
    }
    return { structured: result.structuredContent, text };
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    const response = await this.request({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "oma-video", version: "1.0.0" },
      },
    });
    if (response.error) {
      throw new Error(
        `voicebox mcp initialize: ${response.error.message ?? "rpc error"}`,
      );
    }
    await this.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
    this.initialized = true;
  }

  /** Fire-and-forget JSON-RPC notification (202/204 responses expected). */
  private async notify(body: Record<string, unknown>): Promise<void> {
    await http.post(this.mcpUrl, body, {
      timeout: this.timeoutMs,
      headers: this.headers(),
      responseType: "text",
      transformResponse: [(data: unknown) => data],
      validateStatus: () => true,
    });
  }

  private async request(
    body: Record<string, unknown>,
  ): Promise<JsonRpcResponse> {
    const res = await http.post(this.mcpUrl, body, {
      timeout: this.timeoutMs,
      headers: this.headers(),
      // Keep the raw body: Streamable HTTP servers answer with either plain
      // JSON or an SSE stream, dispatched on the response content-type.
      responseType: "text",
      transformResponse: [(data: unknown) => data],
    });
    const session = readHeader(res.headers, "mcp-session-id");
    if (session) this.sessionId = session;
    return parseRpcBody(
      typeof res.data === "string" ? res.data : JSON.stringify(res.data),
      readHeader(res.headers, "content-type") ?? "",
    );
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    return headers;
  }
}

function readHeader(headers: unknown, name: string): string | undefined {
  const value = (headers as Record<string, unknown> | undefined)?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Parse a Streamable HTTP body: plain JSON or an SSE stream of JSON events. */
function parseRpcBody(raw: string, contentType: string): JsonRpcResponse {
  if (!contentType.includes("text/event-stream")) {
    return JSON.parse(raw) as JsonRpcResponse;
  }
  // SSE: each event's `data:` lines carry one JSON-RPC message. The response
  // to our request is the last event with a `result` or `error` member
  // (interleaved notifications have neither).
  let response: JsonRpcResponse | undefined;
  let dataLines: string[] = [];
  const flush = () => {
    if (dataLines.length === 0) return;
    try {
      const message = JSON.parse(dataLines.join("\n")) as JsonRpcResponse;
      if (message.result !== undefined || message.error !== undefined) {
        response = message;
      }
    } catch {
      // Ignore non-JSON keep-alive events.
    }
    dataLines = [];
  };
  for (const line of raw.split(/\r?\n/)) {
    if (line === "") {
      flush();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  flush();
  if (!response) throw new Error("voicebox mcp: no JSON-RPC response in SSE");
  return response;
}
