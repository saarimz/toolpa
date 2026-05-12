import { describe, expect, it } from "vitest";

import {
  ANALYSIS_PATHS,
  AnalysisPathSchema,
  pickAnalysisFields,
  SAMPLE_ANALYSIS_SCHEMA_VERSION,
  SampleAnalysisSchema,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";

function buildAnalysis(): SampleAnalysis {
  return {
    schema_version: SAMPLE_ANALYSIS_SCHEMA_VERSION,
    source: {
      sample_rate: 44100,
      channels: 1,
      duration_s: 1.5,
      sha256: "a".repeat(64),
    },
    global: {
      lufs_integrated: -16,
      true_peak_dbfs: -1,
      rms_dbfs: -12,
      crest_factor_db: 11,
      stereo_width: 0,
      is_silent: false,
      dc_offset: 0,
    },
    spectral: {
      centroid_hz: { mean: 1500, std: 200, min: 800, max: 3000 },
      rolloff85_hz: { mean: 4000, std: 500, min: 2000, max: 8000 },
      flatness: { mean: 0.2, std: 0.05, min: 0.1, max: 0.4 },
      flux: { mean: 0.5, std: 0.1, min: 0.1, max: 1.5 },
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
      bpm_confidence: 0.8,
      beat_offset_s: 0,
      onsets_s: [0, 0.5, 1.0],
      onset_rate_hz: 2,
      swing_ratio: 1,
    },
    envelope: { attack_ms: 5, decay_t60_ms: 200, peak_position_frac: 0.05 },
    slices: [],
    beats: [],
    role: "oneshot",
    role_confidence: 0.6,
    tags: null,
    llm_descriptors: null,
    pipeline_version: "1.0.0-mvp",
    analyzed_at: 1700000000000,
  };
}

describe("SampleAnalysisSchema", () => {
  it("round-trips a fully-populated analysis", () => {
    const original = buildAnalysis();
    const parsed = SampleAnalysisSchema.parse(original);
    expect(parsed).toEqual(original);
  });

  it("rejects bad sha256 length", () => {
    const original = buildAnalysis();
    const bad = { ...original, source: { ...original.source, sha256: "abc" } };
    expect(() => SampleAnalysisSchema.parse(bad)).toThrow();
  });
});

describe("AnalysisPathSchema", () => {
  it("accepts all enumerated paths", () => {
    for (const path of ANALYSIS_PATHS) {
      expect(() => AnalysisPathSchema.parse(path)).not.toThrow();
    }
  });

  it("rejects unknown paths", () => {
    expect(() => AnalysisPathSchema.parse("global.bogus")).toThrow();
  });
});

describe("pickAnalysisFields", () => {
  it("picks the requested dotted paths only", () => {
    const analysis = buildAnalysis();
    const picked = pickAnalysisFields(analysis, ["rhythm.bpm", "tonal.key", "role"]);
    expect(picked).toEqual({
      "rhythm.bpm": 120,
      "tonal.key": "C",
      role: "oneshot",
    });
  });

  it("omits paths that resolve to undefined", () => {
    const analysis = { ...buildAnalysis(), envelope: null };
    const picked = pickAnalysisFields(analysis, ["envelope.attack_ms"]);
    expect(picked).toEqual({});
  });
});
