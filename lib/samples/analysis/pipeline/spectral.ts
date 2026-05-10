import { downmixToMono } from "@/lib/samples/analysis/pipeline/decode";
import type { SampleAnalysis, Stats } from "@/lib/samples/analysis/schema";

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;
const MFCC_COEFFICIENTS = 13;
const MEL_FILTER_COUNT = 40;

export type SpectralAnalysis = SampleAnalysis["spectral"];

export type SpectralFrames = {
  frameRate: number;
  frameSize: number;
  centroid_hz: Float32Array;
  rolloff85_hz: Float32Array;
  flatness: Float32Array;
  flux: Float32Array;
  magnitudeSpectra: Float32Array[];
};

export function analyzeSpectral(
  channels: Float32Array[],
  sampleRate: number,
): { spectral: SpectralAnalysis; frames: SpectralFrames } {
  const mono = downmixToMono(channels);
  const frames = computeSpectralFrames(mono, sampleRate);

  if (frames.centroid_hz.length === 0) {
    const emptyMfcc = new Array(MFCC_COEFFICIENTS).fill(0);
    return {
      spectral: {
        centroid_hz: emptyStats(),
        rolloff85_hz: emptyStats(),
        flatness: emptyStats(),
        flux: emptyStats(),
        mfcc_mean: emptyMfcc,
        mfcc_std: emptyMfcc,
      },
      frames,
    };
  }

  const melFilterBank = makeMelFilterBank(
    MEL_FILTER_COUNT,
    frames.magnitudeSpectra[0].length,
    sampleRate,
  );
  const dctMatrix = makeDctMatrix(MFCC_COEFFICIENTS, MEL_FILTER_COUNT);

  const mfccFrames: number[][] = [];
  for (const magnitude of frames.magnitudeSpectra) {
    mfccFrames.push(computeMfcc(magnitude, melFilterBank, dctMatrix));
  }

  const mfccMean = aggregateMfccMean(mfccFrames);
  const mfccStd = aggregateMfccStd(mfccFrames, mfccMean);

  return {
    spectral: {
      centroid_hz: computeStats(frames.centroid_hz),
      rolloff85_hz: computeStats(frames.rolloff85_hz),
      flatness: computeStats(frames.flatness),
      flux: computeStats(frames.flux),
      mfcc_mean: mfccMean,
      mfcc_std: mfccStd,
    },
    frames,
  };
}

export function computeSpectralFrames(
  mono: Float32Array,
  sampleRate: number,
): SpectralFrames {
  const window = makeHannWindow(FRAME_SIZE);
  const frameCount = Math.max(0, Math.floor((mono.length - FRAME_SIZE) / HOP_SIZE) + 1);
  const centroid = new Float32Array(Math.max(0, frameCount));
  const rolloff = new Float32Array(Math.max(0, frameCount));
  const flatness = new Float32Array(Math.max(0, frameCount));
  const flux = new Float32Array(Math.max(0, frameCount));
  const magnitudeSpectra: Float32Array[] = [];

  let previousMagnitude: Float32Array | null = null;
  const reusableFrame = new Float32Array(FRAME_SIZE);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const start = frameIndex * HOP_SIZE;
    for (let sampleIndex = 0; sampleIndex < FRAME_SIZE; sampleIndex++) {
      reusableFrame[sampleIndex] = mono[start + sampleIndex] * window[sampleIndex];
    }

    const magnitude = magnitudeSpectrum(reusableFrame);
    magnitudeSpectra.push(magnitude);
    centroid[frameIndex] = spectralCentroidHz(magnitude, sampleRate, FRAME_SIZE);
    rolloff[frameIndex] = spectralRolloffHz(magnitude, sampleRate, FRAME_SIZE, 0.85);
    flatness[frameIndex] = spectralFlatness(magnitude);
    flux[frameIndex] = previousMagnitude ? spectralFlux(magnitude, previousMagnitude) : 0;
    previousMagnitude = magnitude;
  }

  return {
    frameRate: sampleRate / HOP_SIZE,
    frameSize: FRAME_SIZE,
    centroid_hz: centroid,
    rolloff85_hz: rolloff,
    flatness,
    flux,
    magnitudeSpectra,
  };
}

export function makeHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index++) {
    window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (size - 1)));
  }
  return window;
}

export function magnitudeSpectrum(frame: Float32Array): Float32Array {
  const real = new Float32Array(frame.length);
  const imag = new Float32Array(frame.length);
  real.set(frame);
  fftInPlace(real, imag);
  const half = frame.length / 2;
  const magnitude = new Float32Array(half + 1);
  for (let index = 0; index <= half; index++) {
    magnitude[index] = Math.hypot(real[index], imag[index]);
  }
  return magnitude;
}

export function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error(`FFT size must be a positive power of two, received ${n}`);
  }

  let target = 0;
  for (let position = 0; position < n; position++) {
    if (target > position) {
      [real[position], real[target]] = [real[target], real[position]];
      [imag[position], imag[target]] = [imag[target], imag[position]];
    }
    let mask = n >> 1;
    while (target & mask) {
      target ^= mask;
      mask >>= 1;
    }
    target ^= mask;
  }

  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const angleStep = (-2 * Math.PI) / size;
    for (let blockStart = 0; blockStart < n; blockStart += size) {
      for (let pairIndex = 0; pairIndex < halfSize; pairIndex++) {
        const angle = angleStep * pairIndex;
        const wReal = Math.cos(angle);
        const wImag = Math.sin(angle);
        const evenIndex = blockStart + pairIndex;
        const oddIndex = evenIndex + halfSize;
        const tReal = wReal * real[oddIndex] - wImag * imag[oddIndex];
        const tImag = wReal * imag[oddIndex] + wImag * real[oddIndex];
        real[oddIndex] = real[evenIndex] - tReal;
        imag[oddIndex] = imag[evenIndex] - tImag;
        real[evenIndex] += tReal;
        imag[evenIndex] += tImag;
      }
    }
  }
}

export function spectralCentroidHz(
  magnitude: Float32Array,
  sampleRate: number,
  frameSize: number,
): number {
  let weightedSum = 0;
  let totalEnergy = 0;
  for (let bin = 0; bin < magnitude.length; bin++) {
    const energy = magnitude[bin] * magnitude[bin];
    weightedSum += bin * energy;
    totalEnergy += energy;
  }
  if (totalEnergy < 1e-12) {
    return 0;
  }
  const centroidBin = weightedSum / totalEnergy;
  return (centroidBin * sampleRate) / frameSize;
}

export function spectralRolloffHz(
  magnitude: Float32Array,
  sampleRate: number,
  frameSize: number,
  threshold: number,
): number {
  let totalEnergy = 0;
  for (let bin = 0; bin < magnitude.length; bin++) {
    totalEnergy += magnitude[bin] * magnitude[bin];
  }
  if (totalEnergy < 1e-12) {
    return 0;
  }

  const target = totalEnergy * threshold;
  let cumulative = 0;
  for (let bin = 0; bin < magnitude.length; bin++) {
    cumulative += magnitude[bin] * magnitude[bin];
    if (cumulative >= target) {
      return (bin * sampleRate) / frameSize;
    }
  }
  return ((magnitude.length - 1) * sampleRate) / frameSize;
}

export function spectralFlatness(magnitude: Float32Array): number {
  const length = magnitude.length;
  if (length === 0) {
    return 0;
  }

  const floor = 1e-12;
  let logSum = 0;
  let arithmeticSum = 0;
  for (let bin = 0; bin < length; bin++) {
    const energy = magnitude[bin] * magnitude[bin];
    const value = Math.max(floor, energy);
    logSum += Math.log(value);
    arithmeticSum += value;
  }
  if (arithmeticSum < floor) {
    return 0;
  }

  const geometricMean = Math.exp(logSum / length);
  const arithmeticMean = arithmeticSum / length;
  return Math.min(1, geometricMean / arithmeticMean);
}

export function spectralFlux(
  current: Float32Array,
  previous: Float32Array,
): number {
  const length = Math.min(current.length, previous.length);
  let sum = 0;
  for (let bin = 0; bin < length; bin++) {
    const diff = Math.max(0, current[bin] - previous[bin]);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function makeMelFilterBank(
  filterCount: number,
  binCount: number,
  sampleRate: number,
): Float32Array[] {
  const minMel = hzToMel(0);
  const maxMel = hzToMel(sampleRate / 2);
  const melPoints = new Array(filterCount + 2);
  for (let index = 0; index < melPoints.length; index++) {
    melPoints[index] = minMel + ((maxMel - minMel) * index) / (filterCount + 1);
  }

  const fftBins = melPoints.map(
    (mel) => Math.floor(((binCount - 1) * 2 * melToHz(mel)) / sampleRate),
  );

  const filters: Float32Array[] = [];
  for (let filterIndex = 0; filterIndex < filterCount; filterIndex++) {
    const filter = new Float32Array(binCount);
    const start = fftBins[filterIndex];
    const center = fftBins[filterIndex + 1];
    const end = fftBins[filterIndex + 2];

    for (let bin = start; bin < center; bin++) {
      filter[bin] = center === start ? 0 : (bin - start) / (center - start);
    }
    for (let bin = center; bin <= end && bin < binCount; bin++) {
      filter[bin] = end === center ? 0 : (end - bin) / (end - center);
    }
    filters.push(filter);
  }
  return filters;
}

export function makeDctMatrix(coefficients: number, inputs: number): number[][] {
  const matrix: number[][] = [];
  for (let coefficient = 0; coefficient < coefficients; coefficient++) {
    const row: number[] = [];
    for (let input = 0; input < inputs; input++) {
      row.push(
        Math.cos((Math.PI * coefficient * (2 * input + 1)) / (2 * inputs)),
      );
    }
    matrix.push(row);
  }
  return matrix;
}

export function computeMfcc(
  magnitude: Float32Array,
  melFilters: Float32Array[],
  dctMatrix: number[][],
): number[] {
  const melEnergies = new Array(melFilters.length).fill(0);
  for (let filterIndex = 0; filterIndex < melFilters.length; filterIndex++) {
    const filter = melFilters[filterIndex];
    let sum = 0;
    for (let bin = 0; bin < filter.length; bin++) {
      sum += filter[bin] * magnitude[bin];
    }
    melEnergies[filterIndex] = Math.log(Math.max(1e-12, sum));
  }

  const mfcc = new Array<number>(dctMatrix.length).fill(0);
  for (let coefficient = 0; coefficient < dctMatrix.length; coefficient++) {
    const row = dctMatrix[coefficient];
    let sum = 0;
    for (let input = 0; input < row.length; input++) {
      sum += row[input] * melEnergies[input];
    }
    mfcc[coefficient] = sum;
  }
  return mfcc;
}

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

export function computeStats(values: ArrayLike<number>): Stats {
  if (values.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0 };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }
  const mean = sum / values.length;

  let varianceSum = 0;
  for (let index = 0; index < values.length; index++) {
    const diff = values[index] - mean;
    varianceSum += diff * diff;
  }
  const std = Math.sqrt(varianceSum / values.length);

  return { mean, std, min, max };
}

function aggregateMfccMean(frames: number[][]): number[] {
  const length = frames[0]?.length ?? MFCC_COEFFICIENTS;
  const mean = new Array<number>(length).fill(0);
  for (const frame of frames) {
    for (let index = 0; index < length; index++) {
      mean[index] += frame[index];
    }
  }
  for (let index = 0; index < length; index++) {
    mean[index] /= Math.max(1, frames.length);
  }
  return mean;
}

function aggregateMfccStd(frames: number[][], mean: number[]): number[] {
  const length = mean.length;
  const std = new Array<number>(length).fill(0);
  for (const frame of frames) {
    for (let index = 0; index < length; index++) {
      const diff = frame[index] - mean[index];
      std[index] += diff * diff;
    }
  }
  for (let index = 0; index < length; index++) {
    std[index] = Math.sqrt(std[index] / Math.max(1, frames.length));
  }
  return std;
}

function emptyStats(): Stats {
  return { mean: 0, std: 0, min: 0, max: 0 };
}
