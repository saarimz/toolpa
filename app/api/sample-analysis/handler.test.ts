import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gateway", () => ({
  isGatewayConfigured: vi.fn(() => false),
  getGatewayModel: vi.fn(() => "model"),
}));
vi.mock("ai", () => ({
  Output: { object: vi.fn((input) => ({ output: input })) },
  generateText: vi.fn(async () => ({ output: { timbre: [], mood: [], use_case: [], suggested_genres: [] } })),
}));

import { handleSampleAnalysisRequest } from "@/app/api/sample-analysis/handler";
import {
  SAMPLE_ANALYSIS_SCHEMA_VERSION,
  type LlmDescriptors,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";

function makeAnalysis(): SampleAnalysis {
  return {
    schema_version: SAMPLE_ANALYSIS_SCHEMA_VERSION,
    source: {
      sample_rate: 44100,
      channels: 1,
      duration_s: 1,
      sha256: "c".repeat(64),
    },
    global: {
      lufs_integrated: -10,
      true_peak_dbfs: -1,
      rms_dbfs: -10,
      crest_factor_db: 9,
      stereo_width: 0,
      is_silent: false,
      dc_offset: 0,
    },
    spectral: {
      centroid_hz: { mean: 1000, std: 100, min: 500, max: 2000 },
      rolloff85_hz: { mean: 3000, std: 300, min: 1500, max: 5000 },
      flatness: { mean: 0.2, std: 0.05, min: 0.1, max: 0.3 },
      flux: { mean: 0.4, std: 0.1, min: 0.1, max: 1.0 },
      mfcc_mean: Array.from({ length: 13 }, () => 0),
      mfcc_std: Array.from({ length: 13 }, () => 1),
    },
    tonal: {
      chroma_mean: Array.from({ length: 12 }, () => 1 / 12),
      key: null,
      scale: null,
      key_strength: 0,
      tuning_hz: 440,
    },
    rhythm: {
      bpm: null,
      bpm_confidence: 0,
      beat_offset_s: null,
      onsets_s: [],
      onset_rate_hz: 0,
      swing_ratio: null,
    },
    envelope: null,
    slices: [],
    beats: [],
    role: null,
    role_confidence: 0,
    llm_descriptors: null,
    pipeline_version: "1.0.0-mvp",
    analyzed_at: 1700000000000,
  };
}

const FAKE_DESCRIPTORS: LlmDescriptors = {
  timbre: ["dark", "saturated"],
  mood: ["urgent"],
  use_case: ["intro hit"],
  suggested_genres: ["techno", "industrial"],
};

describe("handleSampleAnalysisRequest", () => {
  it("returns 503 when the gateway is not configured", async () => {
    const response = await handleSampleAnalysisRequest(
      new Request("http://localhost/api/sample-analysis", {
        method: "POST",
        body: JSON.stringify({ analysis: makeAnalysis() }),
        headers: { "Content-Type": "application/json" },
      }),
      { isConfigured: () => false },
    );
    expect(response.status).toBe(503);
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await handleSampleAnalysisRequest(
      new Request("http://localhost/api/sample-analysis", {
        method: "POST",
        body: "not json",
      }),
      { isConfigured: () => true },
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid analysis schema", async () => {
    const response = await handleSampleAnalysisRequest(
      new Request("http://localhost/api/sample-analysis", {
        method: "POST",
        body: JSON.stringify({ analysis: { invalid: true } }),
        headers: { "Content-Type": "application/json" },
      }),
      { isConfigured: () => true },
    );
    expect(response.status).toBe(400);
  });

  it("delegates to describe and returns descriptors", async () => {
    const describe = vi.fn().mockResolvedValue(FAKE_DESCRIPTORS);
    const response = await handleSampleAnalysisRequest(
      new Request("http://localhost/api/sample-analysis", {
        method: "POST",
        body: JSON.stringify({ analysis: makeAnalysis(), sourceName: "kick.wav" }),
        headers: { "Content-Type": "application/json" },
      }),
      { isConfigured: () => true, describe },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ descriptors: FAKE_DESCRIPTORS });
    expect(describe).toHaveBeenCalledOnce();
    expect(describe.mock.calls[0][0]).toMatchObject({
      analysis: { source: { sha256: "c".repeat(64) } },
      sourceName: "kick.wav",
    });
  });

  it("returns 500 when describe throws", async () => {
    const describe = vi.fn().mockRejectedValue(new Error("model timeout"));
    const response = await handleSampleAnalysisRequest(
      new Request("http://localhost/api/sample-analysis", {
        method: "POST",
        body: JSON.stringify({ analysis: makeAnalysis() }),
        headers: { "Content-Type": "application/json" },
      }),
      { isConfigured: () => true, describe },
    );
    expect(response.status).toBe(500);
  });
});
