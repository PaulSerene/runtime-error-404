// VoiceProvider — oma-voice / Voicebox MCP (design 013 §5).
//
// Key-optional, two-branch contract (backend rule 11):
//   real     : probe /health → MCP voicebox_speak (REST /speak fallback) →
//              generation_id → REST GET /audio/{id} (save wav into
//              runDir/audio) → MCP voicebox_transcribe (REST /transcribe
//              fallback) → timing.json (source: voicebox-stt)
//   fallback : silent / estimated timing, no audio file (source: estimated)
//
// The MCP tools live on Voicebox's Streamable HTTP surface at `<base>/mcp`;
// audio retrieval stays REST-only (MCP has no save-to-disk). Voicebox plays
// generated audio on the speakers as a side effect (design §5); in mock mode
// we never take the real branch so replay is byte-identical and silent.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { http } from "@cli/io/http";
import { ESTIMATED_SECONDS_PER_WORD, isMockMode } from "../internal/mock.js";
import { VOICEBOX_BASE_URL } from "../internal/readiness.js";
import {
  VoiceboxMcpClient,
  type VoiceboxToolResult,
} from "../internal/voicebox-mcp.js";
import type {
  Availability,
  CostEstimate,
  VoiceOpts,
  VoiceProvider,
} from "../providers.js";
import {
  type AudioRef,
  type NarrationLine,
  type Timing,
  VIDEO_SCHEMA_VERSION,
} from "../types.js";

/** Result of a real Voicebox synthesis (one wav + per-segment timing). */
interface SynthesisResult {
  audio: AudioRef;
  timing: Timing;
}

/** Raw transcription segments as returned by Voicebox (same shape MCP/REST). */
interface RawTranscriptionSegment {
  start: number;
  end: number;
  words?: Array<{ word: string; start: number; end: number }>;
}

export class VoiceboxVoiceProvider implements VoiceProvider {
  readonly id = "oma-voice";

  private mcpClient: VoiceboxMcpClient | undefined;

  constructor(private readonly baseUrl: string = VOICEBOX_BASE_URL) {}

  /** Lazy MCP client for Voicebox's Streamable HTTP surface at `<base>/mcp`. */
  private mcp(): VoiceboxMcpClient {
    this.mcpClient ??= new VoiceboxMcpClient(`${this.baseUrl}/mcp`);
    return this.mcpClient;
  }

  async available(): Promise<Availability> {
    // The estimated fallback is always reachable; "voice: none" or a down
    // Voicebox must not hard-fail the run, so this provider always reports
    // available and decides real-vs-fallback at synthesis time.
    return { ok: true };
  }

  estimateCost(): CostEstimate {
    // Local on-device TTS — no per-call cost (design §4.5: "oma-voice local").
    return { usd: 0, basis: "oma-voice local TTS" };
  }

  async synthesize(
    lines: NarrationLine[],
    opts: VoiceOpts,
  ): Promise<SynthesisResult> {
    // Fallback whenever Voicebox is absent, the user opted out (voice: none),
    // or we are in the deterministic golden harness.
    if (isMockMode() || opts.dryRun || opts.voice === "none") {
      return this.estimatedTiming(lines);
    }
    const healthy = await this.probeHealth();
    if (!healthy) {
      return this.estimatedTiming(lines);
    }
    try {
      return await this.realSynthesis(lines, opts);
    } catch {
      // Any failure on the live path degrades gracefully to estimated timing
      // rather than aborting the whole run (fallback-chain isolation).
      return this.estimatedTiming(lines);
    }
  }

  private async probeHealth(): Promise<boolean> {
    try {
      const res = await http.get(`${this.baseUrl}/health`, {
        timeout: 1500,
        validateStatus: () => true,
      });
      return res.status >= 200 && res.status < 300;
    } catch {
      return false;
    }
  }

  /**
   * Real Voicebox path: MCP tools first (voicebox_speak /
   * voicebox_transcribe on `<base>/mcp`), REST second — each hop is its own
   * key-optional pair so a Voicebox build without the MCP surface still works.
   */
  private async realSynthesis(
    lines: NarrationLine[],
    opts: VoiceOpts,
  ): Promise<SynthesisResult> {
    await mkdir(path.join(opts.runDir, "audio"), { recursive: true });
    const rel = path.join("audio", "narration-01.wav");
    const text = lines.map((line) => line.text).join("\n");

    const generationId = await this.speakGenerationId(text, opts);

    // ★ design §5: MCP has no save-to-disk — retrieve the wav over REST.
    const wav = await http.get(`${this.baseUrl}/audio/${generationId}`, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    await writeFile(path.join(opts.runDir, rel), Buffer.from(wav.data));

    const timing = await this.transcribe(rel, lines, opts.runDir);
    return { audio: { path: rel }, timing };
  }

  /**
   * voicebox_speak{ text, profile, language } via MCP → generation_id;
   * falls back to the REST submit endpoint when the MCP surface is absent or
   * its result carries no usable id.
   */
  private async speakGenerationId(
    text: string,
    opts: VoiceOpts,
  ): Promise<string> {
    try {
      const result = await this.mcp().callTool("voicebox_speak", {
        text,
        profile: opts.voice,
        language: opts.locale,
      });
      const id = extractGenerationId(result);
      if (id) return id;
    } catch {
      // MCP surface unavailable — fall through to REST.
    }
    return this.submitSpeak(text, opts);
  }

  /** REST submit for speech generation; returns the generation_id. */
  private async submitSpeak(text: string, opts: VoiceOpts): Promise<string> {
    const res = await http.post(
      `${this.baseUrl}/speak`,
      { text, profile: opts.voice, language: opts.locale },
      { timeout: 30000 },
    );
    const id = (res.data as { generation_id?: string } | undefined)
      ?.generation_id;
    if (!id) throw new Error("voicebox: missing generation_id");
    return id;
  }

  /**
   * Word-level timing for the saved wav: MCP voicebox_transcribe{ audio_path }
   * first, REST /transcribe second — same voicebox-stt timing either way.
   */
  private async transcribe(
    audioRel: string,
    lines: NarrationLine[],
    runDir: string,
  ): Promise<Timing> {
    const audioPath = path.join(runDir, audioRel);
    const segments =
      (await this.transcribeViaMcp(audioPath)) ??
      (await this.transcribeViaRest(audioPath));
    if (segments.length === 0) {
      // TODO(oma-deferred): whisper-cpp — a local whisper.cpp transcription
      // hop could sit here before the estimate (enum value already reserved
      // in Timing.source). Until wired, degrade straight to estimated timing
      // while still keeping the real audio file.
      const est = estimateSegments(lines);
      return {
        schemaVersion: VIDEO_SCHEMA_VERSION,
        audio: audioRel,
        totalSec: est.totalSec,
        segments: est.segments.map((seg, idx) => ({
          ...seg,
          sceneId: lines[idx]?.sceneId ?? seg.sceneId,
        })),
        source: "voicebox-stt",
      };
    }
    let totalSec = 0;
    const mapped = segments.map((seg, idx) => {
      totalSec = Math.max(totalSec, seg.end);
      return {
        sceneId:
          lines[idx]?.sceneId ?? `scene-${String(idx + 1).padStart(2, "0")}`,
        startSec: seg.start,
        endSec: seg.end,
        words: (seg.words ?? []).map((w) => ({
          t: w.word,
          startSec: w.start,
          endSec: w.end,
        })),
      };
    });
    return {
      schemaVersion: VIDEO_SCHEMA_VERSION,
      audio: audioRel,
      totalSec,
      segments: mapped,
      source: "voicebox-stt",
    };
  }

  /** MCP transcription; null (not throw) so the REST branch is still tried. */
  private async transcribeViaMcp(
    audioPath: string,
  ): Promise<RawTranscriptionSegment[] | null> {
    try {
      const result = await this.mcp().callTool("voicebox_transcribe", {
        audio_path: audioPath,
      });
      const payload = structuredOrJsonText(result) as
        | { segments?: RawTranscriptionSegment[] }
        | undefined;
      return Array.isArray(payload?.segments) ? payload.segments : null;
    } catch {
      return null;
    }
  }

  /** REST transcription of the saved wav. */
  private async transcribeViaRest(
    audioPath: string,
  ): Promise<RawTranscriptionSegment[]> {
    const res = await http.post(
      `${this.baseUrl}/transcribe`,
      { audio_path: audioPath },
      { timeout: 60000 },
    );
    const data = res.data as
      | { segments?: RawTranscriptionSegment[] }
      | undefined;
    return data?.segments ?? [];
  }

  /**
   * Deterministic estimated timing, no audio file. Pure function of the lines:
   * each word gets a fixed duration, so timing.json is byte-identical on
   * replay (source: estimated).
   */
  private estimatedTiming(lines: NarrationLine[]): SynthesisResult {
    const est = estimateSegments(lines);
    return {
      audio: { path: "" },
      timing: {
        schemaVersion: VIDEO_SCHEMA_VERSION,
        audio: "",
        totalSec: est.totalSec,
        segments: est.segments,
        source: "estimated",
      },
    };
  }
}

/** MCP tool payload: structuredContent preferred, JSON-parsed text second. */
function structuredOrJsonText(result: VoiceboxToolResult): unknown {
  if (result.structured && typeof result.structured === "object") {
    return result.structured;
  }
  if (result.text) {
    try {
      return JSON.parse(result.text);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Pull the generation_id out of a voicebox_speak MCP result. */
function extractGenerationId(result: VoiceboxToolResult): string | undefined {
  const payload = structuredOrJsonText(result) as
    | { generation_id?: unknown }
    | undefined;
  const id = payload?.generation_id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** Shared deterministic segment estimator (also reused on partial real paths). */
function estimateSegments(lines: NarrationLine[]): {
  totalSec: number;
  segments: Timing["segments"];
} {
  let cursor = 0;
  const segments = lines.map((line) => {
    const words = line.text.split(/\s+/).filter(Boolean);
    const estimated = Math.max(1, words.length * ESTIMATED_SECONDS_PER_WORD);
    // Honor the scene's allotted duration when provided so captions stay aligned
    // with the scene visuals; fall back to the word-count estimate otherwise.
    const duration =
      line.durationSec && line.durationSec > 0 ? line.durationSec : estimated;
    const startSec = cursor;
    const endSec = cursor + duration;
    cursor = endSec;
    // Distribute word timings evenly across the (possibly scene-fixed) duration.
    const perWord = words.length > 0 ? duration / words.length : duration;
    return {
      sceneId: line.sceneId,
      startSec,
      endSec,
      words: words.map((t, idx) => ({
        t,
        startSec: startSec + idx * perWord,
        endSec: startSec + (idx + 1) * perWord,
      })),
    };
  });
  return { totalSec: cursor, segments };
}
