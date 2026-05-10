import { describe, expect, it } from "vitest";

import {
  analyzeSpectral,
  computeStats,
  fftInPlace,
  magnitudeSpectrum,
  makeHannWindow,
  spectralCentroidHz,
  spectralFlatness,
  spectralRolloffHz,
} from "@/lib/samples/analysis/pipeline/spectral";

const SAMPLE_RATE = 44100;
const FRAME_SIZE = 1024;

function generateSine(frequency: number, durationSec: number, amplitude = 0.5) {
  const length = Math.floor(durationSec * SAMPLE_RATE);
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    samples[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
  }
  return samples;
}

function generateWhiteNoise(length: number, seed = 1234) {
  let state = seed;
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    state = (state * 9301 + 49297) % 233280;
    samples[index] = (state / 233280) * 2 - 1;
  }
  return samples;
}

function windowedFrame(samples: Float32Array): Float32Array {
  const window = makeHannWindow(samples.length);
  const out = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index++) {
    out[index] = samples[index] * window[index];
  }
  return out;
}

describe("FFT", () => {
  it("recovers a unit impulse spectrum", () => {
    const length = 8;
    const real = new Float32Array(length);
    const imag = new Float32Array(length);
    real[0] = 1;
    fftInPlace(real, imag);
    for (let index = 0; index < length; index++) {
      expect(real[index]).toBeCloseTo(1, 6);
      expect(imag[index]).toBeCloseTo(0, 6);
    }
  });

  it("rejects non-power-of-two sizes", () => {
    expect(() => fftInPlace(new Float32Array(3), new Float32Array(3))).toThrow();
  });
});

describe("spectral primitives", () => {
  it("centroid of a 1 kHz sine sits near 1 kHz", () => {
    const sine = generateSine(1000, 0.5);
    const magnitude = magnitudeSpectrum(windowedFrame(sine.subarray(0, FRAME_SIZE)));
    const centroid = spectralCentroidHz(magnitude, SAMPLE_RATE, FRAME_SIZE);
    expect(centroid).toBeGreaterThan(900);
    expect(centroid).toBeLessThan(1100);
  });

  it("flatness is much lower for sines than for white noise", () => {
    const sine = generateSine(1000, 0.5);
    const sineFlatness = spectralFlatness(
      magnitudeSpectrum(windowedFrame(sine.subarray(0, FRAME_SIZE))),
    );
    const noise = generateWhiteNoise(FRAME_SIZE);
    const noiseFlatness = spectralFlatness(magnitudeSpectrum(windowedFrame(noise)));

    expect(noiseFlatness).toBeGreaterThan(sineFlatness * 5);
  });

  it("rolloff85 sits above the centroid for windowed sine", () => {
    const sine = generateSine(2000, 0.2);
    const magnitude = magnitudeSpectrum(windowedFrame(sine.subarray(0, FRAME_SIZE)));
    const centroid = spectralCentroidHz(magnitude, SAMPLE_RATE, FRAME_SIZE);
    const rolloff = spectralRolloffHz(magnitude, SAMPLE_RATE, FRAME_SIZE, 0.85);
    expect(rolloff).toBeGreaterThan(0);
    expect(rolloff).toBeGreaterThanOrEqual(centroid);
    expect(rolloff).toBeLessThan(SAMPLE_RATE / 2);
  });
});

describe("computeStats", () => {
  it("returns zeros for empty input", () => {
    expect(computeStats(new Float32Array(0))).toEqual({
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
    });
  });

  it("computes mean/std/min/max", () => {
    const values = new Float32Array([1, 2, 3, 4]);
    const stats = computeStats(values);
    expect(stats.mean).toBeCloseTo(2.5, 5);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(4);
    expect(stats.std).toBeCloseTo(Math.sqrt(((1 - 2.5) ** 2 + (2 - 2.5) ** 2 + (3 - 2.5) ** 2 + (4 - 2.5) ** 2) / 4), 5);
  });
});

describe("analyzeSpectral", () => {
  it("returns 13 MFCC coefficients for a non-trivial signal", () => {
    const sine = generateSine(440, 1, 0.5);
    const result = analyzeSpectral([sine], SAMPLE_RATE);
    expect(result.spectral.mfcc_mean).toHaveLength(13);
    expect(result.spectral.mfcc_std).toHaveLength(13);
    expect(result.frames.frameRate).toBeGreaterThan(0);
  });
});
