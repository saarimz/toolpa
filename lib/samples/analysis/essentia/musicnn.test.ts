import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const initializeSpy = vi.fn(async () => undefined);
  const predictSpy = vi.fn();
  const computeFrameWiseSpy = vi.fn(() => ({ melSpectrum: [[1, 2, 3]] }));

  function FakeMusiCNN(this: {
    initialize: typeof initializeSpy;
    predict: typeof predictSpy;
  }) {
    this.initialize = initializeSpy;
    this.predict = predictSpy;
  }
  function FakeExtractor(this: {
    computeFrameWise: typeof computeFrameWiseSpy;
  }) {
    this.computeFrameWise = computeFrameWiseSpy;
  }
  return {
    initializeSpy,
    predictSpy,
    computeFrameWiseSpy,
    FakeMusiCNN: FakeMusiCNN as unknown as new (...args: unknown[]) => unknown,
    FakeExtractor: FakeExtractor as unknown as new (...args: unknown[]) => unknown,
  };
});

vi.mock("@tensorflow/tfjs", () => ({
  ready: vi.fn(async () => undefined),
  version: { tfjs: "fake" },
  getBackend: vi.fn(() => "cpu"),
}));

vi.mock("essentia.js/dist/essentia.js-model.es.js", () => ({
  EssentiaTFInputExtractor: mocks.FakeExtractor,
  TensorflowMusiCNN: mocks.FakeMusiCNN,
}));

vi.mock("essentia.js", () => ({
  default: { EssentiaWASM: {} },
}));

import {
  MSD_MUSICNN_TAGS,
  runMusicnn,
} from "@/lib/samples/analysis/essentia/musicnn";

const SAMPLE_RATE = 16000;

function makeSamples(seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  return new Float32Array(seconds * sampleRate);
}

describe("runMusicnn", () => {
  it("returns null for samples shorter than 3 seconds", async () => {
    mocks.initializeSpy.mockClear();
    mocks.predictSpy.mockClear();
    const result = await runMusicnn([makeSamples(1)], SAMPLE_RATE);
    expect(result).toBeNull();
    expect(mocks.initializeSpy).not.toHaveBeenCalled();
  });

  it("averages predictions across frames and reports top tags", async () => {
    mocks.initializeSpy.mockClear();
    mocks.predictSpy.mockClear();
    const fiftyZeros = new Array<number>(50).fill(0);
    const ambientIndex = MSD_MUSICNN_TAGS.indexOf("ambient");
    const electronicIndex = MSD_MUSICNN_TAGS.indexOf("electronic");
    const frameOne = [...fiftyZeros];
    const frameTwo = [...fiftyZeros];
    frameOne[ambientIndex] = 0.4;
    frameOne[electronicIndex] = 0.3;
    frameTwo[ambientIndex] = 0.6;
    frameTwo[electronicIndex] = 0.1;
    mocks.predictSpy.mockResolvedValueOnce([frameOne, frameTwo]);

    const result = await runMusicnn([makeSamples(4)], SAMPLE_RATE);
    expect(result).not.toBeNull();
    if (!result) throw new Error();
    expect(result.musicnn[0].label).toBe("ambient");
    expect(result.musicnn[0].score).toBeCloseTo(0.5, 5);
    expect(result.musicnn[1].label).toBe("electronic");
    expect(result.musicnn[1].score).toBeCloseTo(0.2, 5);
    expect(result.model_id).toBe("msd-musicnn-1");
  });

  it("computes voice_present_prob from vocalist labels", async () => {
    mocks.initializeSpy.mockClear();
    mocks.predictSpy.mockClear();
    const scores = new Array<number>(50).fill(0);
    const femaleIdx = MSD_MUSICNN_TAGS.indexOf("female vocalists");
    scores[femaleIdx] = 0.72;
    mocks.predictSpy.mockResolvedValueOnce([scores]);

    const result = await runMusicnn([makeSamples(4)], SAMPLE_RATE);
    expect(result?.voice_present_prob).toBeCloseTo(0.72, 5);
  });

  it("returns null and warns when inference throws", async () => {
    mocks.initializeSpy.mockClear();
    mocks.predictSpy.mockClear();
    mocks.predictSpy.mockRejectedValueOnce(new Error("boom"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await runMusicnn([makeSamples(4)], SAMPLE_RATE);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
