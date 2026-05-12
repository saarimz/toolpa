import { describe, expect, it, vi } from "vitest";

import { handleAnalyzeUploadRequest } from "@/app/api/analyze-upload/handler";
import {
  SAMPLE_ANALYSIS_SCHEMA_VERSION,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";

function makeAnalysis(): SampleAnalysis {
  return {
    schema_version: SAMPLE_ANALYSIS_SCHEMA_VERSION,
    source: {
      sample_rate: 44100,
      channels: 1,
      duration_s: 1,
      sha256: "d".repeat(64),
    },
    global: {
      lufs_integrated: -18,
      true_peak_dbfs: -1,
      rms_dbfs: -12,
      crest_factor_db: 11,
      stereo_width: 0,
      is_silent: false,
      dc_offset: 0,
    },
    spectral: {
      centroid_hz: { mean: 1000, std: 0, min: 1000, max: 1000 },
      rolloff85_hz: { mean: 3000, std: 0, min: 3000, max: 3000 },
      flatness: { mean: 0.2, std: 0, min: 0.2, max: 0.2 },
      flux: { mean: 0.4, std: 0, min: 0.4, max: 0.4 },
      mfcc_mean: Array.from({ length: 13 }, () => 0),
      mfcc_std: Array.from({ length: 13 }, () => 1),
    },
    tonal: {
      chroma_mean: Array.from({ length: 12 }, () => 1 / 12),
      key: "C",
      scale: "major",
      key_strength: 0.7,
      tuning_hz: 440,
    },
    rhythm: {
      bpm: 120,
      bpm_confidence: 0.9,
      beat_offset_s: 0,
      onsets_s: [0, 0.5, 1],
      onset_rate_hz: 3,
      swing_ratio: null,
    },
    envelope: null,
    slices: [],
    beats: [],
    role: "loop",
    role_confidence: 0.4,
    tags: null,
    llm_descriptors: null,
    pipeline_version: "2.0.0-essentia",
    analyzed_at: 1700000000000,
  };
}

describe("handleAnalyzeUploadRequest", () => {
  it("rejects unsupported content-type with 415", async () => {
    const response = await handleAnalyzeUploadRequest(
      new Request("http://localhost/api/analyze-upload", {
        method: "POST",
        headers: { "Content-Type": "audio/mpeg" },
        body: new ArrayBuffer(8),
      }),
    );
    expect(response.status).toBe(415);
  });

  it("rejects oversized bodies with 413", async () => {
    const decode = vi.fn();
    const runPipeline = vi.fn();
    const response = await handleAnalyzeUploadRequest(
      new Request("http://localhost/api/analyze-upload", {
        method: "POST",
        headers: { "Content-Type": "audio/wav", "Content-Length": "1000" },
        body: new ArrayBuffer(1000),
      }),
      { decodeWav: decode, runPipeline, maxBytes: 100 },
    );
    expect(response.status).toBe(413);
    expect(decode).not.toHaveBeenCalled();
  });

  it("returns 415 when WAV decode throws", async () => {
    const decode = vi.fn(() => {
      throw new Error("not a WAV");
    });
    const runPipeline = vi.fn();
    const response = await handleAnalyzeUploadRequest(
      new Request("http://localhost/api/analyze-upload", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: new ArrayBuffer(64),
      }),
      { decodeWav: decode, runPipeline },
    );
    expect(response.status).toBe(415);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("returns analysis JSON on success", async () => {
    const decode = vi.fn(() => ({
      sampleRate: 44100,
      channels: [new Float32Array(44100)],
      durationSec: 1,
    }));
    const analysis = makeAnalysis();
    const runPipeline = vi.fn(async (input: unknown) => {
      void input;
      return analysis;
    });
    const response = await handleAnalyzeUploadRequest(
      new Request("http://localhost/api/analyze-upload", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: new ArrayBuffer(64),
      }),
      { decodeWav: decode, runPipeline },
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as { analysis: SampleAnalysis };
    expect(json.analysis.source.sha256).toBe("d".repeat(64));
    expect(runPipeline).toHaveBeenCalledOnce();
    expect(runPipeline.mock.calls[0][0]).toMatchObject({
      sampleRate: 44100,
      durationSec: 1,
      includeMusicnn: false,
    });
  });

  it("returns 500 if pipeline throws", async () => {
    const decode = vi.fn(() => ({
      sampleRate: 44100,
      channels: [new Float32Array(44100)],
      durationSec: 1,
    }));
    const runPipeline = vi.fn(async () => {
      throw new Error("oops");
    });
    const response = await handleAnalyzeUploadRequest(
      new Request("http://localhost/api/analyze-upload", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: new ArrayBuffer(64),
      }),
      { decodeWav: decode, runPipeline },
    );
    expect(response.status).toBe(500);
  });
});
