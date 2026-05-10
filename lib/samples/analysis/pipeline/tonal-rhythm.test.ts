import { describe, expect, it } from "vitest";

import { analyzeSpectral } from "@/lib/samples/analysis/pipeline/spectral";
import {
  analyzeRhythm,
  analyzeTonal,
  detectOnsetIndices,
  estimateKey,
} from "@/lib/samples/analysis/pipeline/tonal-rhythm";

const SAMPLE_RATE = 44100;

function generateChord(frequencies: number[], durationSec: number) {
  const length = Math.floor(durationSec * SAMPLE_RATE);
  const samples = new Float32Array(length);
  const amplitude = 0.3 / frequencies.length;
  for (const frequency of frequencies) {
    for (let index = 0; index < length; index++) {
      samples[index] +=
        amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
    }
  }
  return samples;
}

function generateClickTrain(intervalSec: number, count: number) {
  const totalDuration = intervalSec * (count + 1);
  const length = Math.floor(totalDuration * SAMPLE_RATE);
  const samples = new Float32Array(length);
  for (let click = 1; click <= count; click++) {
    const center = Math.floor(click * intervalSec * SAMPLE_RATE);
    for (let offset = -32; offset <= 32; offset++) {
      const position = center + offset;
      if (position >= 0 && position < length) {
        const envelope = Math.exp(-Math.abs(offset) / 8);
        samples[position] = envelope;
      }
    }
  }
  return samples;
}

describe("estimateKey", () => {
  it("identifies C major from a C-E-G triad (C5 octave for clean bin alignment)", () => {
    // FFT bin width at sr 44100 / size 1024 ≈ 43 Hz. C4/E4/G4 fundamentals collide
    // with adjacent bins; C5/E5/G5 sit on bins that map cleanly to their pitch
    // classes, so this is the smallest test that exercises the algorithm without
    // hitting a bin-resolution corner case (which is a real algorithm limit, not a
    // bug — Phase 2 swaps in essentia for finer resolution).
    const cMajor = generateChord([523.25, 659.25, 783.99], 1.5);
    const { spectral, frames } = analyzeSpectral([cMajor], SAMPLE_RATE);
    expect(spectral.mfcc_mean).toHaveLength(13);
    const tonal = analyzeTonal(frames, SAMPLE_RATE);
    expect(tonal.key).toBe("C");
    expect(tonal.scale).toBe("major");
    expect(tonal.key_strength).toBeGreaterThan(0.4);
  });

  it("returns null when chroma is empty", () => {
    const empty = new Float32Array(12);
    expect(estimateKey(empty)).toEqual({ key: null, scale: null, strength: 0 });
  });
});

describe("detectOnsetIndices", () => {
  it("detects peaks above threshold separated by gaps", () => {
    const flux = new Float32Array([0, 0, 5, 0, 0, 0, 6, 0, 0, 0, 4, 0]);
    const onsets = detectOnsetIndices(flux);
    expect(onsets.length).toBeGreaterThanOrEqual(2);
    expect(onsets).toContain(2);
    expect(onsets).toContain(6);
  });

  it("returns empty array for empty flux", () => {
    expect(detectOnsetIndices(new Float32Array(0))).toEqual([]);
  });
});

describe("analyzeRhythm", () => {
  it("recovers a click train at 120 BPM (500 ms intervals) within ±15 BPM", () => {
    const intervalSec = 0.5;
    const clicks = generateClickTrain(intervalSec, 8);
    const { frames } = analyzeSpectral([clicks], SAMPLE_RATE);
    const rhythm = analyzeRhythm(frames, SAMPLE_RATE, clicks.length);

    expect(rhythm.bpm).not.toBeNull();
    if (rhythm.bpm !== null) {
      const bpmCandidates = [rhythm.bpm, rhythm.bpm * 2, rhythm.bpm / 2];
      const best = bpmCandidates.reduce(
        (closest, candidate) =>
          Math.abs(candidate - 120) < Math.abs(closest - 120) ? candidate : closest,
        bpmCandidates[0],
      );
      expect(Math.abs(best - 120)).toBeLessThan(15);
    }
    expect(rhythm.onsets_s.length).toBeGreaterThanOrEqual(4);
  });

  it("returns nulls for empty flux", () => {
    const empty = new Float32Array(0);
    const result = analyzeRhythm(
      {
        frameRate: SAMPLE_RATE / 512,
        frameSize: 1024,
        centroid_hz: empty,
        rolloff85_hz: empty,
        flatness: empty,
        flux: empty,
        magnitudeSpectra: [],
      },
      SAMPLE_RATE,
      0,
    );
    expect(result.bpm).toBeNull();
    expect(result.onsets_s).toEqual([]);
  });
});
