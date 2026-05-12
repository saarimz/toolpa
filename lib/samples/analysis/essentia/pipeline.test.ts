import { describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  extractGlobal: vi.fn(),
  extractSpectral: vi.fn(),
  extractTonal: vi.fn(),
  extractRhythm: vi.fn(),
  runMusicnn: vi.fn(),
  analyzeSlices: vi.fn(),
  analyzeEnvelope: vi.fn(),
  inferRole: vi.fn(),
}));

vi.mock("@/lib/samples/analysis/essentia/extract", () => ({
  extractGlobal: stubs.extractGlobal,
  extractSpectral: stubs.extractSpectral,
  extractTonal: stubs.extractTonal,
  extractRhythm: stubs.extractRhythm,
}));

vi.mock("@/lib/samples/analysis/essentia/musicnn", () => ({
  runMusicnn: stubs.runMusicnn,
}));

vi.mock("@/lib/samples/analysis/pipeline/slices", () => ({
  analyzeSlices: stubs.analyzeSlices,
  analyzeEnvelope: stubs.analyzeEnvelope,
}));

vi.mock("@/lib/samples/analysis/pipeline/role", () => ({
  inferRole: stubs.inferRole,
  evidenceFromAnalysis: vi.fn(() => ({})),
}));

import {
  ESSENTIA_PIPELINE_VERSION,
  runEssentiaPipeline,
} from "@/lib/samples/analysis/essentia/pipeline";

const fakeGlobal = {
  lufs_integrated: -16,
  true_peak_dbfs: -1,
  rms_dbfs: -12,
  crest_factor_db: 11,
  stereo_width: 0,
  is_silent: false,
  dc_offset: 0,
};

const fakeSpectral = {
  centroid_hz: { mean: 1200, std: 100, min: 800, max: 2000 },
  rolloff85_hz: { mean: 3500, std: 300, min: 2000, max: 5000 },
  flatness: { mean: 0.2, std: 0.05, min: 0.1, max: 0.4 },
  flux: { mean: 0.4, std: 0.1, min: 0.1, max: 1 },
  mfcc_mean: Array.from({ length: 13 }, () => 0),
  mfcc_std: Array.from({ length: 13 }, () => 1),
};

const fakeTonal = {
  chroma_mean: Array.from({ length: 12 }, () => 1 / 12),
  key: "C" as const,
  scale: "major" as const,
  key_strength: 0.7,
  tuning_hz: 440,
};

const fakeRhythm = {
  bpm: 120,
  bpm_confidence: 0.85,
  beat_offset_s: 0.01,
  onsets_s: [0, 0.5, 1],
  onset_rate_hz: 3,
  swing_ratio: null,
};

function setupHappyStubs() {
  stubs.extractGlobal.mockReturnValue(fakeGlobal);
  stubs.extractSpectral.mockReturnValue({
    spectral: fakeSpectral,
    chromaMean: new Float32Array(12),
  });
  stubs.extractTonal.mockReturnValue(fakeTonal);
  stubs.extractRhythm.mockReturnValue(fakeRhythm);
  stubs.analyzeSlices.mockReturnValue([]);
  stubs.analyzeEnvelope.mockReturnValue(null);
  stubs.inferRole.mockReturnValue({ role: "loop", confidence: 0.5 });
}

describe("runEssentiaPipeline", () => {
  it("assembles a SampleAnalysis from the stage outputs", async () => {
    Object.values(stubs).forEach((stub) => stub.mockReset());
    setupHappyStubs();

    const channels = [new Float32Array(44100)];
    const result = await runEssentiaPipeline({
      arrayBuffer: new ArrayBuffer(64),
      channels,
      sampleRate: 44100,
      durationSec: 1,
    });

    expect(result.global).toEqual(fakeGlobal);
    expect(result.spectral).toEqual(fakeSpectral);
    expect(result.tonal).toEqual(fakeTonal);
    expect(result.rhythm).toEqual(fakeRhythm);
    expect(result.role).toBe("loop");
    expect(result.role_confidence).toBe(0.5);
    expect(result.tags).toBeNull();
    expect(result.pipeline_version).toBe(ESSENTIA_PIPELINE_VERSION);
    expect(result.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stubs.runMusicnn).not.toHaveBeenCalled();
  });

  it("includes MusiCNN tags when includeMusicnn is true", async () => {
    Object.values(stubs).forEach((stub) => stub.mockReset());
    setupHappyStubs();
    stubs.runMusicnn.mockResolvedValue({
      musicnn: [{ label: "ambient", score: 0.5 }],
      voice_present_prob: 0,
      model_id: "msd-musicnn-1",
    });

    const result = await runEssentiaPipeline({
      arrayBuffer: new ArrayBuffer(64),
      channels: [new Float32Array(44100)],
      sampleRate: 44100,
      durationSec: 1,
      includeMusicnn: true,
    });

    expect(result.tags?.musicnn[0].label).toBe("ambient");
    expect(result.tags?.model_id).toBe("msd-musicnn-1");
    expect(stubs.runMusicnn).toHaveBeenCalledOnce();
  });

  it("leaves tags null if MusiCNN returns null", async () => {
    Object.values(stubs).forEach((stub) => stub.mockReset());
    setupHappyStubs();
    stubs.runMusicnn.mockResolvedValue(null);

    const result = await runEssentiaPipeline({
      arrayBuffer: new ArrayBuffer(64),
      channels: [new Float32Array(44100)],
      sampleRate: 44100,
      durationSec: 1,
      includeMusicnn: true,
    });
    expect(result.tags).toBeNull();
  });
});
