import { downmixToMono } from "@/lib/samples/analysis/pipeline/decode";
import {
  amplitudeToDbfs,
  computePeak,
  computeRms,
} from "@/lib/samples/analysis/pipeline/global";
import {
  computeMfcc,
  magnitudeSpectrum,
  makeDctMatrix,
  makeHannWindow,
  makeMelFilterBank,
  spectralCentroidHz,
  spectralFlatness,
  spectralRolloffHz,
} from "@/lib/samples/analysis/pipeline/spectral";
import type {
  SampleAnalysis,
  SliceFeatures,
} from "@/lib/samples/analysis/schema";

const SLICE_FRAME_SIZE = 1024;
const MFCC_COEFFICIENTS = 13;
const MEL_FILTERS = 40;
const MAX_SLICE_DURATION_S = 1.5;
const ENVELOPE_DECAY_FLOOR_DBFS = -40;
const ENVELOPE_T60_TARGET_DB = 60;

export type EnvelopeAnalysis = SampleAnalysis["envelope"];

export function analyzeSlices(
  channels: Float32Array[],
  sampleRate: number,
  onsetsSec: number[],
): SliceFeatures[] {
  const mono = downmixToMono(channels);
  if (mono.length === 0 || onsetsSec.length === 0) {
    return [];
  }

  const dctMatrix = makeDctMatrix(MFCC_COEFFICIENTS, MEL_FILTERS);
  const sortedOnsets = [...onsetsSec].sort((left, right) => left - right);
  const features: SliceFeatures[] = [];
  const totalDuration = mono.length / sampleRate;

  for (let index = 0; index < sortedOnsets.length; index++) {
    const start = Math.max(0, sortedOnsets[index]);
    const next = sortedOnsets[index + 1] ?? totalDuration;
    const end = Math.min(totalDuration, Math.min(next, start + MAX_SLICE_DURATION_S));
    if (end - start < 0.01) {
      continue;
    }

    const slice = mono.subarray(
      Math.floor(start * sampleRate),
      Math.floor(end * sampleRate),
    );
    if (slice.length < 32) {
      continue;
    }
    features.push(extractSliceFeatures(slice, sampleRate, dctMatrix, start, end));
  }
  return features;
}

export function extractSliceFeatures(
  slice: Float32Array,
  sampleRate: number,
  dctMatrix: number[][],
  startSec: number,
  endSec: number,
): SliceFeatures {
  const peak = computePeak(slice);
  const rms = computeRms(slice);
  const zcr = computeZeroCrossingRate(slice);
  const padded = padToPowerOfTwo(slice, SLICE_FRAME_SIZE);
  const window = makeHannWindow(padded.length);
  for (let index = 0; index < padded.length; index++) {
    padded[index] *= window[index];
  }

  const magnitude = magnitudeSpectrum(padded);
  const centroid = spectralCentroidHz(magnitude, sampleRate, padded.length);
  const rolloff = spectralRolloffHz(magnitude, sampleRate, padded.length, 0.85);
  const flatness = spectralFlatness(magnitude);
  const melFilters = makeMelFilterBank(MEL_FILTERS, magnitude.length, sampleRate);
  const mfcc = computeMfcc(magnitude, melFilters, dctMatrix);
  const fundamental = estimateFundamentalHz(slice, sampleRate);
  const envelope = computeSliceEnvelope(slice, sampleRate);

  return {
    start_s: startSec,
    end_s: endSec,
    rms_dbfs: amplitudeToDbfs(rms),
    peak_dbfs: amplitudeToDbfs(peak),
    centroid_hz: centroid,
    rolloff85_hz: rolloff,
    flatness,
    zcr,
    fundamental_hz: flatness > 0.5 ? null : fundamental,
    mfcc,
    attack_ms: envelope.attack_ms,
    decay_t60_ms: envelope.decay_t60_ms,
  };
}

export function computeZeroCrossingRate(samples: Float32Array): number {
  if (samples.length < 2) {
    return 0;
  }
  let crossings = 0;
  for (let index = 1; index < samples.length; index++) {
    if ((samples[index - 1] >= 0) !== (samples[index] >= 0)) {
      crossings += 1;
    }
  }
  return crossings / (samples.length - 1);
}

export function padToPowerOfTwo(
  samples: Float32Array,
  minimumSize: number,
): Float32Array {
  let size = minimumSize;
  while (size < samples.length) {
    size *= 2;
  }
  if (size === samples.length) {
    return Float32Array.from(samples);
  }
  const padded = new Float32Array(size);
  padded.set(samples);
  return padded;
}

export function estimateFundamentalHz(
  slice: Float32Array,
  sampleRate: number,
): number | null {
  const minLag = Math.max(2, Math.floor(sampleRate / 800));
  const maxLag = Math.min(slice.length - 1, Math.floor(sampleRate / 50));
  if (maxLag <= minLag) {
    return null;
  }

  let bestLag = -1;
  let bestValue = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = slice.length - lag;
    for (let index = 0; index < limit; index++) {
      sum += slice[index] * slice[index + lag];
    }
    const value = sum / limit;
    if (value > bestValue) {
      bestValue = value;
      bestLag = lag;
    }
  }

  if (bestLag <= 0) {
    return null;
  }
  return sampleRate / bestLag;
}

export function computeSliceEnvelope(
  slice: Float32Array,
  sampleRate: number,
): { attack_ms: number | null; decay_t60_ms: number | null } {
  if (slice.length === 0) {
    return { attack_ms: null, decay_t60_ms: null };
  }

  const rmsCurve = computeRmsEnvelope(slice, sampleRate, 0.005);
  if (rmsCurve.length === 0) {
    return { attack_ms: null, decay_t60_ms: null };
  }

  let peakIndex = 0;
  let peakValue = -Infinity;
  for (let index = 0; index < rmsCurve.length; index++) {
    if (rmsCurve[index] > peakValue) {
      peakValue = rmsCurve[index];
      peakIndex = index;
    }
  }

  if (peakValue <= 0) {
    return { attack_ms: null, decay_t60_ms: null };
  }

  const stepSec = 0.005;
  const attackMs = peakIndex * stepSec * 1000;

  const peakDb = amplitudeToDbfs(peakValue);
  const decayTargetIndex = findDecayIndex(rmsCurve, peakIndex, peakDb - 18);
  if (decayTargetIndex === null) {
    return { attack_ms: attackMs, decay_t60_ms: null };
  }

  const decay18Ms = (decayTargetIndex - peakIndex) * stepSec * 1000;
  const decayT60Ms = (decay18Ms * ENVELOPE_T60_TARGET_DB) / 18;
  return { attack_ms: attackMs, decay_t60_ms: decayT60Ms };
}

function findDecayIndex(
  curve: Float32Array,
  fromIndex: number,
  targetDb: number,
): number | null {
  for (let index = fromIndex + 1; index < curve.length; index++) {
    const valueDb = amplitudeToDbfs(curve[index]);
    if (valueDb < ENVELOPE_DECAY_FLOOR_DBFS) {
      return null;
    }
    if (valueDb <= targetDb) {
      return index;
    }
  }
  return null;
}

export function computeRmsEnvelope(
  samples: Float32Array,
  sampleRate: number,
  hopSec: number,
): Float32Array {
  const hop = Math.max(1, Math.floor(hopSec * sampleRate));
  const window = hop * 2;
  const length = Math.floor((samples.length - window) / hop) + 1;
  if (length <= 0) {
    return new Float32Array(0);
  }

  const result = new Float32Array(length);
  for (let frame = 0; frame < length; frame++) {
    const start = frame * hop;
    let sum = 0;
    for (let index = 0; index < window; index++) {
      const value = samples[start + index];
      sum += value * value;
    }
    result[frame] = Math.sqrt(sum / window);
  }
  return result;
}

export function analyzeEnvelope(
  channels: Float32Array[],
  sampleRate: number,
  durationSec: number,
  onsetCount: number,
): EnvelopeAnalysis {
  const mono = downmixToMono(channels);
  if (mono.length === 0) {
    return null;
  }

  const looksLikeOneshot = durationSec < 2.5 && onsetCount <= 2;
  if (!looksLikeOneshot) {
    return null;
  }

  const envelope = computeSliceEnvelope(mono, sampleRate);
  let peakPosition = 0;
  let peakValue = -Infinity;
  for (let index = 0; index < mono.length; index++) {
    const value = Math.abs(mono[index]);
    if (value > peakValue) {
      peakValue = value;
      peakPosition = index;
    }
  }

  return {
    attack_ms: envelope.attack_ms,
    decay_t60_ms: envelope.decay_t60_ms,
    peak_position_frac: mono.length === 0 ? 0 : peakPosition / mono.length,
  };
}
