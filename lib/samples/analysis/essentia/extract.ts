import {
  amplitudeToDbfs,
  computePeak,
  computeRms,
  computeMean,
  computeStereoWidth,
} from "@/lib/samples/analysis/pipeline/global";
import { computeStats } from "@/lib/samples/analysis/pipeline/spectral";
import {
  estimateSwingRatio,
  magnitudeToChroma as customMagnitudeToChroma,
} from "@/lib/samples/analysis/pipeline/tonal-rhythm";
import {
  getEssentia,
  safeDelete,
  vectorToArray,
  withChannelVectors,
  withMonoVector,
  type EssentiaVector,
} from "@/lib/samples/analysis/essentia/runner";
import type { SampleAnalysis, Stats } from "@/lib/samples/analysis/schema";

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;
const MFCC_COEFFICIENTS = 13;
const MEL_FILTER_COUNT = 40;
const SILENCE_PEAK_DBFS = -60;
const NEG_INFINITY_DBFS = -120;

export type GlobalAnalysis = SampleAnalysis["global"];
export type SpectralAnalysis = SampleAnalysis["spectral"];
export type TonalAnalysis = SampleAnalysis["tonal"];
export type RhythmAnalysis = SampleAnalysis["rhythm"];

export function extractGlobal(
  channels: Float32Array[],
): GlobalAnalysis {
  const mono = channels.length === 1 ? channels[0] : downmixForSummary(channels);
  const peak = computePeak(mono);
  const rms = computeRms(mono);
  const peakDbfs = amplitudeToDbfs(peak);
  const rmsDbfs = amplitudeToDbfs(rms);
  const dcOffset = computeMean(mono);
  const stereoWidth = computeStereoWidth(channels);
  const lufs = extractIntegratedLoudness(channels);

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

function downmixForSummary(channels: Float32Array[]): Float32Array {
  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    let sum = 0;
    for (let channel = 0; channel < channels.length; channel++) {
      sum += channels[channel][index];
    }
    mono[index] = sum / channels.length;
  }
  return mono;
}

function extractIntegratedLoudness(channels: Float32Array[]): number {
  if (channels.length === 0 || channels[0].length === 0) {
    return NEG_INFINITY_DBFS;
  }

  return withChannelVectors(channels, (left, right) => {
    const essentia = getEssentia();
    const result = essentia.LoudnessEBUR128(left, right);
    try {
      const value = result.integratedLoudness;
      if (!Number.isFinite(value)) {
        return NEG_INFINITY_DBFS;
      }
      return value;
    } finally {
      safeDelete(result.momentaryLoudness);
      safeDelete(result.shortTermLoudness);
    }
  });
}

export function extractSpectral(
  channels: Float32Array[],
  sampleRate: number,
): { spectral: SpectralAnalysis; chromaMean: Float32Array } {
  if (channels[0]?.length < FRAME_SIZE) {
    return emptySpectralResult();
  }

  const essentia = getEssentia();
  const mono = channels.length === 1 ? channels[0] : downmixForSummary(channels);
  const frames = essentia.FrameGenerator(mono, FRAME_SIZE, HOP_SIZE);
  const frameCount = frames.size();
  const centroidValues = new Float32Array(frameCount);
  const rolloffValues = new Float32Array(frameCount);
  const flatnessValues = new Float32Array(frameCount);
  const fluxValues = new Float32Array(frameCount);
  const mfccPerFrame: number[][] = [];
  const chromaSum = new Float32Array(12);
  let chromaFrameCount = 0;

  let previousSpectrum: EssentiaVector | null = null;

  try {
    for (let index = 0; index < frameCount; index++) {
      const frame = frames.get(index);
      const win = essentia.Windowing(frame);
      const spec = essentia.Spectrum(win.frame);
      try {
        centroidValues[index] = essentia.Centroid(spec.spectrum, sampleRate / 2).centroid;
        rolloffValues[index] = essentia.RollOff(spec.spectrum, 0.85, sampleRate).rollOff;
        flatnessValues[index] = essentia.Flatness(spec.spectrum).flatness;
        if (previousSpectrum) {
          fluxValues[index] = essentia.Flux(spec.spectrum).flux;
        } else {
          fluxValues[index] = 0;
        }
        const mfccResult = essentia.MFCC(
          spec.spectrum,
          2,
          11000,
          undefined,
          0,
          "dbamp",
          0,
          "unit_max",
          MEL_FILTER_COUNT,
          MFCC_COEFFICIENTS,
          sampleRate,
        );
        try {
          mfccPerFrame.push(Array.from(vectorToArray(mfccResult.mfcc)));
        } finally {
          safeDelete(mfccResult.bands);
          safeDelete(mfccResult.mfcc);
        }

        const magnitudes = vectorToArray(spec.spectrum);
        const chroma = customMagnitudeToChroma(magnitudes, sampleRate, FRAME_SIZE);
        for (let bin = 0; bin < 12; bin++) {
          chromaSum[bin] += chroma[bin];
        }
        chromaFrameCount += 1;

        if (previousSpectrum) {
          safeDelete(previousSpectrum);
        }
        previousSpectrum = spec.spectrum;
      } finally {
        safeDelete(win.frame);
      }
    }
  } finally {
    safeDelete(previousSpectrum);
    safeDelete(frames);
  }

  const chromaMean = new Float32Array(12);
  if (chromaFrameCount > 0) {
    let total = 0;
    for (let bin = 0; bin < 12; bin++) {
      chromaMean[bin] = chromaSum[bin] / chromaFrameCount;
      total += chromaMean[bin];
    }
    if (total > 0) {
      for (let bin = 0; bin < 12; bin++) {
        chromaMean[bin] /= total;
      }
    }
  }

  return {
    spectral: {
      centroid_hz: computeStats(centroidValues),
      rolloff85_hz: computeStats(rolloffValues),
      flatness: computeStats(flatnessValues),
      flux: computeStats(fluxValues),
      mfcc_mean: aggregateMfccMean(mfccPerFrame),
      mfcc_std: aggregateMfccStd(mfccPerFrame),
    },
    chromaMean,
  };
}

function emptySpectralResult(): {
  spectral: SpectralAnalysis;
  chromaMean: Float32Array;
} {
  const empty: Stats = { mean: 0, std: 0, min: 0, max: 0 };
  return {
    spectral: {
      centroid_hz: empty,
      rolloff85_hz: empty,
      flatness: empty,
      flux: empty,
      mfcc_mean: new Array(MFCC_COEFFICIENTS).fill(0),
      mfcc_std: new Array(MFCC_COEFFICIENTS).fill(0),
    },
    chromaMean: new Float32Array(12),
  };
}

export function extractTonal(
  channels: Float32Array[],
  chromaMean: Float32Array,
): TonalAnalysis {
  const tuning = 440;
  if (!channels[0] || channels[0].length === 0) {
    return {
      chroma_mean: Array.from(chromaMean),
      key: null,
      scale: null,
      key_strength: 0,
      tuning_hz: tuning,
    };
  }

  return withMonoVector(channels, (_mono, vector) => {
    const essentia = getEssentia();
    const result = essentia.KeyExtractor(vector);
    return {
      chroma_mean: Array.from(chromaMean),
      key: result.strength > 0 ? result.key : null,
      scale: scaleStringToScale(result.scale),
      key_strength: clamp01(result.strength),
      tuning_hz: tuning,
    };
  });
}

function scaleStringToScale(value: string | undefined): "major" | "minor" | null {
  if (value === "major" || value === "minor") {
    return value;
  }
  return null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function extractRhythm(
  channels: Float32Array[],
  sampleRate: number,
): RhythmAnalysis {
  if (!channels[0] || channels[0].length < sampleRate) {
    return zeroRhythm();
  }

  return withMonoVector(channels, (_mono, vector) => {
    const essentia = getEssentia();
    let rhythm: {
      bpm: number;
      ticks: EssentiaVector;
      confidence: number;
      estimates: EssentiaVector;
      bpmIntervals: EssentiaVector;
    } | null = null;
    let onsetResult: { onsetRate: number; onsets?: EssentiaVector } | null = null;
    try {
      rhythm = essentia.RhythmExtractor2013(vector);
      onsetResult = essentia.OnsetRate(vector);

      const ticks = vectorToArray(rhythm.ticks);
      const onsets = onsetResult.onsets ? vectorToArray(onsetResult.onsets) : new Float32Array(0);
      const onsetsArray = onsets.length > 0 ? Array.from(onsets) : Array.from(ticks);
      const onsetRate = onsetResult.onsetRate ?? 0;
      const bpm = rhythm.bpm > 0 ? rhythm.bpm : null;
      const swing = bpm ? estimateSwingRatio(onsetsArray, bpm) : null;

      return {
        bpm,
        bpm_confidence: clamp01(rhythm.confidence ?? 0),
        beat_offset_s: ticks.length > 0 ? ticks[0] : null,
        onsets_s: onsetsArray,
        onset_rate_hz: onsetRate,
        swing_ratio: swing,
      };
    } finally {
      if (rhythm) {
        safeDelete(rhythm.ticks);
        safeDelete(rhythm.estimates);
        safeDelete(rhythm.bpmIntervals);
      }
      if (onsetResult?.onsets) {
        safeDelete(onsetResult.onsets);
      }
    }
  });
}

function zeroRhythm(): RhythmAnalysis {
  return {
    bpm: null,
    bpm_confidence: 0,
    beat_offset_s: null,
    onsets_s: [],
    onset_rate_hz: 0,
    swing_ratio: null,
  };
}

function aggregateMfccMean(frames: number[][]): number[] {
  if (frames.length === 0) {
    return new Array<number>(MFCC_COEFFICIENTS).fill(0);
  }
  const result = new Array<number>(MFCC_COEFFICIENTS).fill(0);
  for (const frame of frames) {
    for (let index = 0; index < MFCC_COEFFICIENTS; index++) {
      result[index] += frame[index];
    }
  }
  for (let index = 0; index < MFCC_COEFFICIENTS; index++) {
    result[index] /= frames.length;
  }
  return result;
}

function aggregateMfccStd(frames: number[][]): number[] {
  if (frames.length === 0) {
    return new Array<number>(MFCC_COEFFICIENTS).fill(0);
  }
  const mean = aggregateMfccMean(frames);
  const result = new Array<number>(MFCC_COEFFICIENTS).fill(0);
  for (const frame of frames) {
    for (let index = 0; index < MFCC_COEFFICIENTS; index++) {
      const diff = frame[index] - mean[index];
      result[index] += diff * diff;
    }
  }
  for (let index = 0; index < MFCC_COEFFICIENTS; index++) {
    result[index] = Math.sqrt(result[index] / frames.length);
  }
  return result;
}
