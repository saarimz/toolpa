import { describe, expect, it } from "vitest";

import {
  amplitudeToDbfs,
  analyzeGlobal,
  computeMean,
  computePeak,
  computeRms,
  computeStereoWidth,
} from "@/lib/samples/analysis/pipeline/global";

const SAMPLE_RATE = 44100;

function generateSine(frequency: number, durationSec: number, amplitude: number) {
  const length = Math.floor(durationSec * SAMPLE_RATE);
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    samples[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
  }
  return samples;
}

describe("analyzeGlobal", () => {
  it("flags silence and reports -120 dBFS", () => {
    const silence = new Float32Array(SAMPLE_RATE);
    const result = analyzeGlobal([silence], SAMPLE_RATE);

    expect(result.is_silent).toBe(true);
    expect(result.true_peak_dbfs).toBe(-120);
    expect(result.rms_dbfs).toBe(-120);
    expect(result.dc_offset).toBe(0);
  });

  it("measures a 1 kHz sine at -6 dBFS within ±0.5 dB", () => {
    const amplitude = Math.pow(10, -6 / 20);
    const sine = generateSine(1000, 1, amplitude);
    const result = analyzeGlobal([sine], SAMPLE_RATE);

    expect(result.true_peak_dbfs).toBeCloseTo(-6, 0);
    expect(result.rms_dbfs).toBeCloseTo(-9, 0);
    expect(result.crest_factor_db).toBeCloseTo(3, 0);
    expect(result.is_silent).toBe(false);
  });

  it("computes stereo width from channel correlation", () => {
    const sine = generateSine(440, 0.5, 0.5);
    const correlated = analyzeGlobal([sine, sine], SAMPLE_RATE);
    expect(correlated.stereo_width).toBeCloseTo(0, 1);

    const inverted = new Float32Array(sine.length);
    for (let index = 0; index < sine.length; index++) {
      inverted[index] = -sine[index];
    }
    const wide = analyzeGlobal([sine, inverted], SAMPLE_RATE);
    expect(wide.stereo_width).toBeCloseTo(0, 1);
  });
});

describe("global helpers", () => {
  it("computes peak and RMS from a known sine", () => {
    const sine = generateSine(440, 0.25, 0.5);
    expect(computePeak(sine)).toBeCloseTo(0.5, 2);
    expect(computeRms(sine)).toBeCloseTo(0.5 / Math.sqrt(2), 2);
    expect(computeMean(sine)).toBeCloseTo(0, 3);
  });

  it("reports decorrelation for orthogonal signals", () => {
    const length = 4096;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let index = 0; index < length; index++) {
      left[index] = Math.sin((2 * Math.PI * 440 * index) / SAMPLE_RATE);
      right[index] = Math.sin((2 * Math.PI * 880 * index) / SAMPLE_RATE);
    }
    const width = computeStereoWidth([left, right]);
    expect(width).toBeGreaterThan(0.5);
  });

  it("converts amplitude to dBFS", () => {
    expect(amplitudeToDbfs(1)).toBeCloseTo(0, 5);
    expect(amplitudeToDbfs(0.5)).toBeCloseTo(-6.02, 1);
    expect(amplitudeToDbfs(0)).toBe(-120);
  });
});
