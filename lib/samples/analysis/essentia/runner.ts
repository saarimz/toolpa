import esPkg from "essentia.js";

import { downmixToMono } from "@/lib/samples/analysis/pipeline/decode";

type EssentiaInstance = {
  version: string;
  algorithmNames: string;
  arrayToVector(array: Float32Array): EssentiaVector;
  vectorToArray(vector: EssentiaVector): Float32Array;
  shutdown(): void;
  FrameGenerator(
    audio: Float32Array,
    frameSize?: number,
    hopSize?: number,
  ): EssentiaVectorVector;
  Windowing(frame: EssentiaVector, normalized?: boolean): { frame: EssentiaVector };
  Spectrum(frame: EssentiaVector, size?: number): { spectrum: EssentiaVector };
  Centroid(array: EssentiaVector, range?: number): { centroid: number };
  RollOff(
    spectrum: EssentiaVector,
    cutoff?: number,
    sampleRate?: number,
  ): { rollOff: number };
  Flatness(array: EssentiaVector): { flatness: number };
  Flux(
    spectrum: EssentiaVector,
    halfRectify?: boolean,
    norm?: string,
  ): { flux: number };
  MFCC(
    spectrum: EssentiaVector,
    dctType?: number,
    highFrequencyBound?: number,
    inputSize?: number,
    liftering?: number,
    logType?: string,
    lowFrequencyBound?: number,
    normalize?: string,
    numberBands?: number,
    numberCoefficients?: number,
    sampleRate?: number,
  ): { bands: EssentiaVector; mfcc: EssentiaVector };
  KeyExtractor(
    audio: EssentiaVector,
    averageDetuningCorrection?: boolean,
    frameSize?: number,
    hopSize?: number,
    hpcpSize?: number,
    maxFrequency?: number,
    maximumSpectralPeaks?: number,
    minFrequency?: number,
    pcpThreshold?: number,
    profileType?: string,
    sampleRate?: number,
  ): { key: string; scale: string; strength: number };
  LoudnessEBUR128(
    left: EssentiaVector,
    right: EssentiaVector,
    hopSize?: number,
    sampleRate?: number,
    startAtZero?: boolean,
  ): {
    momentaryLoudness: EssentiaVector;
    shortTermLoudness: EssentiaVector;
    integratedLoudness: number;
    loudnessRange: number;
  };
  RhythmExtractor2013(
    signal: EssentiaVector,
    maxTempo?: number,
    method?: string,
    minTempo?: number,
  ): {
    bpm: number;
    ticks: EssentiaVector;
    confidence: number;
    estimates: EssentiaVector;
    bpmIntervals: EssentiaVector;
  };
  OnsetRate(signal: EssentiaVector): {
    onsets: EssentiaVector;
    onsetRate: number;
  };
};

export type EssentiaVector = {
  size(): number;
  get(index: number): number;
  delete(): void;
};

export type EssentiaVectorVector = {
  size(): number;
  get(index: number): EssentiaVector;
  delete(): void;
};

let cached: EssentiaInstance | null = null;

export function getEssentia(): EssentiaInstance {
  if (cached) {
    return cached;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctor = (esPkg as any).Essentia;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wasm = (esPkg as any).EssentiaWASM;
  cached = new ctor(wasm) as EssentiaInstance;
  return cached;
}

export function shutdownEssentia(): void {
  if (cached) {
    cached.shutdown();
    cached = null;
  }
}

export function vectorToArray(vector: EssentiaVector): Float32Array {
  const length = vector.size();
  const out = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    out[index] = vector.get(index);
  }
  return out;
}

export function withMonoVector<T>(
  channels: Float32Array[],
  fn: (mono: Float32Array, monoVector: EssentiaVector) => T,
): T {
  const essentia = getEssentia();
  const mono = downmixToMono(channels);
  const vector = essentia.arrayToVector(mono);
  try {
    return fn(mono, vector);
  } finally {
    vector.delete();
  }
}

export function withChannelVectors<T>(
  channels: Float32Array[],
  fn: (left: EssentiaVector, right: EssentiaVector) => T,
): T {
  const essentia = getEssentia();
  const left = essentia.arrayToVector(channels[0] ?? new Float32Array(0));
  const right = essentia.arrayToVector(
    channels[1] ?? channels[0] ?? new Float32Array(0),
  );
  try {
    return fn(left, right);
  } finally {
    left.delete();
    if (channels.length >= 2) {
      right.delete();
    } else if (right !== left) {
      right.delete();
    }
  }
}

export function safeDelete(
  vector: EssentiaVector | EssentiaVectorVector | undefined | null,
): void {
  if (vector && typeof vector.delete === "function") {
    try {
      vector.delete();
    } catch {
      // best-effort cleanup
    }
  }
}
