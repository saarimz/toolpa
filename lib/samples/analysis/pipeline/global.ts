import { downmixToMono } from "@/lib/samples/analysis/pipeline/decode";
import type { SampleAnalysis } from "@/lib/samples/analysis/schema";

const SILENCE_PEAK_DBFS = -60;
const NEG_INFINITY_DBFS = -120;

export type GlobalAnalysis = SampleAnalysis["global"];

export function analyzeGlobal(
  channels: Float32Array[],
  sampleRate: number,
): GlobalAnalysis {
  const mono = downmixToMono(channels);
  const peak = computePeak(mono);
  const rms = computeRms(mono);
  const dcOffset = computeMean(mono);
  const peakDbfs = amplitudeToDbfs(peak);
  const rmsDbfs = amplitudeToDbfs(rms);
  const stereoWidth = computeStereoWidth(channels);
  const lufs = computeApproxLufs(channels, sampleRate);

  return {
    lufs_integrated: lufs,
    true_peak_dbfs: peakDbfs,
    rms_dbfs: rmsDbfs,
    crest_factor_db: peakDbfs - rmsDbfs,
    stereo_width: stereoWidth,
    is_silent: peakDbfs < SILENCE_PEAK_DBFS,
    dc_offset: dcOffset,
  };
}

export function computePeak(samples: Float32Array): number {
  let peak = 0;
  for (let index = 0; index < samples.length; index++) {
    const value = Math.abs(samples[index]);
    if (value > peak) {
      peak = value;
    }
  }
  return peak;
}

export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < samples.length; index++) {
    sum += samples[index] * samples[index];
  }
  return Math.sqrt(sum / samples.length);
}

export function computeMean(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < samples.length; index++) {
    sum += samples[index];
  }
  return sum / samples.length;
}

export function amplitudeToDbfs(amplitude: number): number {
  if (amplitude <= 0) {
    return NEG_INFINITY_DBFS;
  }
  return 20 * Math.log10(amplitude);
}

export function computeStereoWidth(channels: Float32Array[]): number {
  if (channels.length < 2) {
    return 0;
  }

  const correlation = computeCorrelation(channels[0], channels[1]);
  return Math.max(0, Math.min(1, 1 - Math.abs(correlation)));
}

function computeCorrelation(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 1;
  }

  let sumA = 0;
  let sumB = 0;
  let sumAA = 0;
  let sumBB = 0;
  let sumAB = 0;
  for (let index = 0; index < length; index++) {
    const valueA = a[index];
    const valueB = b[index];
    sumA += valueA;
    sumB += valueB;
    sumAA += valueA * valueA;
    sumBB += valueB * valueB;
    sumAB += valueA * valueB;
  }

  const meanA = sumA / length;
  const meanB = sumB / length;
  const varianceA = sumAA / length - meanA * meanA;
  const varianceB = sumBB / length - meanB * meanB;
  const covariance = sumAB / length - meanA * meanB;
  const denominator = Math.sqrt(varianceA * varianceB);
  if (denominator < 1e-12) {
    return 1;
  }

  return covariance / denominator;
}

export function computeApproxLufs(
  channels: Float32Array[],
  sampleRate: number,
): number {
  const mono = downmixToMono(channels);
  const filtered = applyKWeighting(mono, sampleRate);
  const meanSquare = computeMeanSquare(filtered);
  if (meanSquare <= 0) {
    return NEG_INFINITY_DBFS;
  }
  return -0.691 + 10 * Math.log10(meanSquare);
}

function computeMeanSquare(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let index = 0; index < samples.length; index++) {
    sum += samples[index] * samples[index];
  }
  return sum / samples.length;
}

function applyKWeighting(
  samples: Float32Array,
  sampleRate: number,
): Float32Array {
  const stage1 = applyBiquad(samples, kWeightingHighShelfCoeffs(sampleRate));
  return applyBiquad(stage1, kWeightingHighPassCoeffs(sampleRate));
}

type BiquadCoefficients = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

function applyBiquad(
  samples: Float32Array,
  coeffs: BiquadCoefficients,
): Float32Array {
  const output = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < samples.length; index++) {
    const x0 = samples[index];
    const y0 =
      coeffs.b0 * x0 +
      coeffs.b1 * x1 +
      coeffs.b2 * x2 -
      coeffs.a1 * y1 -
      coeffs.a2 * y2;
    output[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

function kWeightingHighShelfCoeffs(sampleRate: number): BiquadCoefficients {
  const f0 = 1681.974450955533;
  const g = 3.999843853973347;
  const q = 0.7071752369554196;
  return designHighShelf(sampleRate, f0, g, q);
}

function kWeightingHighPassCoeffs(sampleRate: number): BiquadCoefficients {
  const f0 = 38.13547087602444;
  const q = 0.5003270373238773;
  return designHighPass(sampleRate, f0, q);
}

function designHighShelf(
  sampleRate: number,
  f0: number,
  gainDb: number,
  q: number,
): BiquadCoefficients {
  const A = Math.pow(10, gainDb / 40);
  const omega = (2 * Math.PI * f0) / sampleRate;
  const alpha = Math.sin(omega) / (2 * q);
  const cosOmega = Math.cos(omega);
  const sqrtA = Math.sqrt(A);

  const b0 = A * (A + 1 + (A - 1) * cosOmega + 2 * sqrtA * alpha);
  const b1 = -2 * A * (A - 1 + (A + 1) * cosOmega);
  const b2 = A * (A + 1 + (A - 1) * cosOmega - 2 * sqrtA * alpha);
  const a0 = A + 1 - (A - 1) * cosOmega + 2 * sqrtA * alpha;
  const a1 = 2 * (A - 1 - (A + 1) * cosOmega);
  const a2 = A + 1 - (A - 1) * cosOmega - 2 * sqrtA * alpha;

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function designHighPass(
  sampleRate: number,
  f0: number,
  q: number,
): BiquadCoefficients {
  const omega = (2 * Math.PI * f0) / sampleRate;
  const alpha = Math.sin(omega) / (2 * q);
  const cosOmega = Math.cos(omega);

  const b0 = (1 + cosOmega) / 2;
  const b1 = -(1 + cosOmega);
  const b2 = (1 + cosOmega) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosOmega;
  const a2 = 1 - alpha;

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}
