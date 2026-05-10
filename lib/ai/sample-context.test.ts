import { describe, expect, it } from "vitest";

import { getAiSampleContext } from "@/lib/ai/sample-context";
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
      duration_s: 2,
      sha256: "b".repeat(64),
    },
    global: {
      lufs_integrated: -14,
      true_peak_dbfs: -1,
      rms_dbfs: -12,
      crest_factor_db: 11,
      stereo_width: 0,
      is_silent: false,
      dc_offset: 0,
    },
    spectral: {
      centroid_hz: { mean: 1200, std: 200, min: 600, max: 2400 },
      rolloff85_hz: { mean: 3500, std: 400, min: 2000, max: 6000 },
      flatness: { mean: 0.3, std: 0.05, min: 0.1, max: 0.4 },
      flux: { mean: 0.4, std: 0.1, min: 0.1, max: 1.0 },
      mfcc_mean: Array.from({ length: 13 }, () => 0),
      mfcc_std: Array.from({ length: 13 }, () => 1),
    },
    tonal: {
      chroma_mean: Array.from({ length: 12 }, () => 1 / 12),
      key: "G",
      scale: "minor",
      key_strength: 0.6,
      tuning_hz: 440,
    },
    rhythm: {
      bpm: 142,
      bpm_confidence: 0.85,
      beat_offset_s: 0.01,
      onsets_s: [0, 0.5, 1.0, 1.5],
      onset_rate_hz: 2,
      swing_ratio: 1.1,
    },
    envelope: null,
    slices: [],
    beats: [],
    role: "loop",
    role_confidence: 0.5,
    llm_descriptors: null,
    pipeline_version: "1.0.0-mvp",
    analyzed_at: 1700000000000,
  };
}

describe("getAiSampleContext", () => {
  it("returns library metadata without analysis when none requested", () => {
    const context = getAiSampleContext({
      id: "library:jungle/let-there-break",
    });
    expect(context.id).toBe("library:jungle/let-there-break");
    expect(context.role).toBe("break");
    expect(context.analysis).toBeNull();
  });

  it("returns upload defaults when the id is unknown", () => {
    const context = getAiSampleContext({
      id: "upload:fresh",
      name: "Fresh.wav",
    });
    expect(context.role).toBe("unknown");
    expect(context.pack).toBe("Browser upload");
    expect(context.analysis).toBeNull();
  });

  it("plucks requested analysis fields when an analysis is provided", () => {
    const context = getAiSampleContext({
      id: "upload:fresh",
      providedAnalysis: makeAnalysis(),
      requiredAnalysis: ["rhythm.bpm", "tonal.key"],
    });
    expect(context.analysis).toEqual({
      "rhythm.bpm": 142,
      "tonal.key": "G",
    });
  });

  it("omits the analysis block when no fields are requested", () => {
    const context = getAiSampleContext({
      id: "upload:fresh",
      providedAnalysis: makeAnalysis(),
    });
    expect(context.analysis).toBeNull();
  });
});
