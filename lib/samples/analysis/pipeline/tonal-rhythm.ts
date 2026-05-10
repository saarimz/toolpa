import type { SpectralFrames } from "@/lib/samples/analysis/pipeline/spectral";
import type { SampleAnalysis } from "@/lib/samples/analysis/schema";

const PITCH_CLASS_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const KRUMHANSL_MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];

const KRUMHANSL_MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

const REFERENCE_FREQUENCY = 440;
const REFERENCE_MIDI = 69;
const MIN_BPM = 60;
const MAX_BPM = 200;
const ONSET_PEAK_THRESHOLD_K = 1.4;

export type TonalAnalysis = SampleAnalysis["tonal"];
export type RhythmAnalysis = SampleAnalysis["rhythm"];

export function analyzeTonal(
  frames: SpectralFrames,
  sampleRate: number,
): TonalAnalysis {
  const chromaFrames = computeChromaFrames(frames, sampleRate);
  const chromaMean = averageChroma(chromaFrames);
  const { key, scale, strength } = estimateKey(chromaMean);

  return {
    chroma_mean: Array.from(chromaMean),
    key,
    scale,
    key_strength: strength,
    tuning_hz: REFERENCE_FREQUENCY,
  };
}

export function analyzeRhythm(
  frames: SpectralFrames,
  sampleRate: number,
  totalSamples: number,
): RhythmAnalysis {
  const durationSec = totalSamples / sampleRate;
  if (frames.flux.length === 0 || durationSec === 0) {
    return {
      bpm: null,
      bpm_confidence: 0,
      beat_offset_s: null,
      onsets_s: [],
      onset_rate_hz: 0,
      swing_ratio: null,
    };
  }

  const onsetIndices = detectOnsetIndices(frames.flux);
  const hopSec = 1 / frames.frameRate;
  const onsetsSec = onsetIndices.map((index) => index * hopSec);
  const onsetRate = onsetsSec.length / Math.max(1e-6, durationSec);
  const tempo = estimateTempo(frames.flux, frames.frameRate);
  const swing = tempo.bpm
    ? estimateSwingRatio(onsetsSec, tempo.bpm)
    : null;

  return {
    bpm: tempo.bpm,
    bpm_confidence: tempo.confidence,
    beat_offset_s: onsetsSec[0] ?? null,
    onsets_s: onsetsSec,
    onset_rate_hz: onsetRate,
    swing_ratio: swing,
  };
}

export function computeChromaFrames(
  frames: SpectralFrames,
  sampleRate: number,
): Float32Array[] {
  const result: Float32Array[] = [];
  for (const magnitude of frames.magnitudeSpectra) {
    result.push(magnitudeToChroma(magnitude, sampleRate, frames.frameSize));
  }
  return result;
}

export function magnitudeToChroma(
  magnitude: Float32Array,
  sampleRate: number,
  frameSize: number,
): Float32Array {
  const chroma = new Float32Array(12);
  for (let bin = 1; bin < magnitude.length; bin++) {
    const frequency = (bin * sampleRate) / frameSize;
    if (frequency < 50 || frequency > 5000) {
      continue;
    }
    const midi = REFERENCE_MIDI + 12 * Math.log2(frequency / REFERENCE_FREQUENCY);
    const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pitchClass] += magnitude[bin] * magnitude[bin];
  }

  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (total > 1e-12) {
    for (let index = 0; index < 12; index++) {
      chroma[index] /= total;
    }
  }
  return chroma;
}

function averageChroma(frames: Float32Array[]): Float32Array {
  const mean = new Float32Array(12);
  if (frames.length === 0) {
    return mean;
  }
  for (const frame of frames) {
    for (let index = 0; index < 12; index++) {
      mean[index] += frame[index];
    }
  }
  for (let index = 0; index < 12; index++) {
    mean[index] /= frames.length;
  }
  const total = mean.reduce((sum, value) => sum + value, 0);
  if (total > 1e-12) {
    for (let index = 0; index < 12; index++) {
      mean[index] /= total;
    }
  }
  return mean;
}

export function estimateKey(chromaMean: Float32Array): {
  key: string | null;
  scale: "major" | "minor" | null;
  strength: number;
} {
  let bestKey: string | null = null;
  let bestScale: "major" | "minor" | null = null;
  let bestCorrelation = -Infinity;
  let secondBestCorrelation = -Infinity;

  for (let tonic = 0; tonic < 12; tonic++) {
    const majorProfile = rotateProfile(KRUMHANSL_MAJOR, tonic);
    const minorProfile = rotateProfile(KRUMHANSL_MINOR, tonic);
    const majorCorrelation = pearson(chromaMean, majorProfile);
    const minorCorrelation = pearson(chromaMean, minorProfile);

    if (majorCorrelation > bestCorrelation) {
      secondBestCorrelation = bestCorrelation;
      bestCorrelation = majorCorrelation;
      bestKey = PITCH_CLASS_NAMES[tonic];
      bestScale = "major";
    } else if (majorCorrelation > secondBestCorrelation) {
      secondBestCorrelation = majorCorrelation;
    }

    if (minorCorrelation > bestCorrelation) {
      secondBestCorrelation = bestCorrelation;
      bestCorrelation = minorCorrelation;
      bestKey = PITCH_CLASS_NAMES[tonic];
      bestScale = "minor";
    } else if (minorCorrelation > secondBestCorrelation) {
      secondBestCorrelation = minorCorrelation;
    }
  }

  if (!Number.isFinite(bestCorrelation) || bestCorrelation <= 0) {
    return { key: null, scale: null, strength: 0 };
  }

  const margin = Math.max(0, bestCorrelation - Math.max(0, secondBestCorrelation));
  const strength = Math.min(1, Math.max(0, bestCorrelation) * (0.5 + margin));
  return { key: bestKey, scale: bestScale, strength };
}

function rotateProfile(profile: number[], tonic: number): number[] {
  const rotated = new Array<number>(profile.length);
  for (let index = 0; index < profile.length; index++) {
    rotated[index] = profile[(index - tonic + profile.length) % profile.length];
  }
  return rotated;
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }

  let sumA = 0;
  let sumB = 0;
  for (let index = 0; index < length; index++) {
    sumA += a[index];
    sumB += b[index];
  }
  const meanA = sumA / length;
  const meanB = sumB / length;

  let numerator = 0;
  let denominatorA = 0;
  let denominatorB = 0;
  for (let index = 0; index < length; index++) {
    const diffA = a[index] - meanA;
    const diffB = b[index] - meanB;
    numerator += diffA * diffB;
    denominatorA += diffA * diffA;
    denominatorB += diffB * diffB;
  }
  const denominator = Math.sqrt(denominatorA * denominatorB);
  if (denominator < 1e-12) {
    return 0;
  }
  return numerator / denominator;
}

export function detectOnsetIndices(flux: Float32Array): number[] {
  if (flux.length === 0) {
    return [];
  }

  let mean = 0;
  for (let index = 0; index < flux.length; index++) {
    mean += flux[index];
  }
  mean /= flux.length;

  let variance = 0;
  for (let index = 0; index < flux.length; index++) {
    const diff = flux[index] - mean;
    variance += diff * diff;
  }
  const std = Math.sqrt(variance / flux.length);
  const threshold = mean + ONSET_PEAK_THRESHOLD_K * std;

  const onsets: number[] = [];
  for (let index = 1; index < flux.length - 1; index++) {
    const value = flux[index];
    if (value <= threshold) {
      continue;
    }
    if (value <= flux[index - 1] || value < flux[index + 1]) {
      continue;
    }
    onsets.push(index);
  }
  return onsets;
}

export function estimateTempo(
  flux: Float32Array,
  frameRate: number,
): { bpm: number | null; confidence: number } {
  if (flux.length < 4 || frameRate <= 0) {
    return { bpm: null, confidence: 0 };
  }

  const detrended = detrend(flux);
  const minLag = Math.max(1, Math.floor((60 / MAX_BPM) * frameRate));
  const maxLag = Math.min(detrended.length - 1, Math.ceil((60 / MIN_BPM) * frameRate));
  if (maxLag <= minLag) {
    return { bpm: null, confidence: 0 };
  }

  const zeroLag = autocorrelationAt(detrended, 0);
  if (zeroLag < 1e-12) {
    return { bpm: null, confidence: 0 };
  }

  let bestLag = -1;
  let bestValue = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const value = autocorrelationAt(detrended, lag);
    if (value > bestValue) {
      bestValue = value;
      bestLag = lag;
    }
  }

  if (bestLag < 0) {
    return { bpm: null, confidence: 0 };
  }

  const periodSec = bestLag / frameRate;
  const bpm = 60 / periodSec;
  const confidence = Math.max(0, Math.min(1, bestValue / zeroLag));
  return { bpm, confidence };
}

function detrend(values: Float32Array): Float32Array {
  let mean = 0;
  for (let index = 0; index < values.length; index++) {
    mean += values[index];
  }
  mean /= values.length;
  const out = new Float32Array(values.length);
  for (let index = 0; index < values.length; index++) {
    out[index] = values[index] - mean;
  }
  return out;
}

function autocorrelationAt(values: Float32Array, lag: number): number {
  const length = values.length - lag;
  if (length <= 0) {
    return 0;
  }
  let sum = 0;
  for (let index = 0; index < length; index++) {
    sum += values[index] * values[index + lag];
  }
  return sum / length;
}

export function estimateSwingRatio(
  onsetsSec: number[],
  bpm: number,
): number | null {
  if (onsetsSec.length < 4 || bpm <= 0) {
    return null;
  }

  const eighthSec = 60 / (bpm * 2);
  const intervals: number[] = [];
  for (let index = 1; index < onsetsSec.length; index++) {
    intervals.push(onsetsSec[index] - onsetsSec[index - 1]);
  }

  const usable = intervals.filter(
    (interval) => interval > eighthSec * 0.4 && interval < eighthSec * 1.8,
  );
  if (usable.length < 4) {
    return null;
  }

  const cutoff = eighthSec;
  const shortIntervals = usable.filter((interval) => interval < cutoff);
  const longIntervals = usable.filter((interval) => interval >= cutoff);
  if (shortIntervals.length === 0 || longIntervals.length === 0) {
    return null;
  }

  const shortMean = mean(shortIntervals);
  const longMean = mean(longIntervals);
  if (shortMean < 1e-6) {
    return null;
  }
  return longMean / shortMean;
}

function mean(values: number[]): number {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}
