import type { VisualizerFeature } from "@/lib/visualizers/schema";

export type AudioBandFeatures = {
  sub: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  air: number;
};

export type AudioFeatureFrame = AudioBandFeatures & {
  beat: number;
  centroid: number;
  flux: number;
  onset: number;
  peak: number;
  rms: number;
  timestampMs: number;
};

export type AudioFeatureMemory = {
  lastBeatMs: number;
  previousSpectrum: Float32Array;
};

export type ComputeAudioFeatureFrameInput = {
  frequencyData: Uint8Array | Float32Array;
  memory?: AudioFeatureMemory;
  sampleRate: number;
  timeDomainData: Uint8Array | Float32Array;
  timestampMs: number;
};

const BAND_LIMITS: Array<[keyof AudioBandFeatures, number, number]> = [
  ["sub", 20, 80],
  ["bass", 80, 250],
  ["lowMid", 250, 500],
  ["mid", 500, 2_000],
  ["highMid", 2_000, 6_000],
  ["air", 6_000, 20_000],
];

export function computeAudioFeatureFrame({
  frequencyData,
  memory,
  sampleRate,
  timeDomainData,
  timestampMs,
}: ComputeAudioFeatureFrameInput): {
  frame: AudioFeatureFrame;
  memory: AudioFeatureMemory;
} {
  const spectrum = normalizeFrequencyData(frequencyData);
  const waveform = normalizeTimeDomainData(timeDomainData);
  const bands = computeBands(spectrum, sampleRate);
  const rms = computeRms(waveform);
  const peak = waveform.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const centroid = computeSpectralCentroid(spectrum, sampleRate);
  const flux = computeSpectralFlux(spectrum, memory?.previousSpectrum);
  const onset = flux > 0.11 && rms > 0.035 ? Math.min(1, flux * 3.5) : 0;
  const beatDetected =
    onset > 0.2 &&
    bands.bass > 0.12 &&
    timestampMs - (memory?.lastBeatMs ?? -Infinity) > 140;
  const lastBeatMs = beatDetected ? timestampMs : (memory?.lastBeatMs ?? -Infinity);
  const beat = Number.isFinite(lastBeatMs)
    ? Math.max(0, 1 - (timestampMs - lastBeatMs) / 260)
    : 0;

  return {
    frame: {
      ...bands,
      beat,
      centroid,
      flux,
      onset,
      peak,
      rms,
      timestampMs,
    },
    memory: {
      lastBeatMs,
      previousSpectrum: spectrum,
    },
  };
}

export function selectAudioFeature(
  frame: AudioFeatureFrame,
  feature: VisualizerFeature,
) {
  return clamp01(frame[feature]);
}

export function createSilentFeatureFrame(timestampMs = 0): AudioFeatureFrame {
  return {
    air: 0,
    bass: 0,
    beat: 0,
    centroid: 0,
    flux: 0,
    highMid: 0,
    lowMid: 0,
    mid: 0,
    onset: 0,
    peak: 0,
    rms: 0,
    sub: 0,
    timestampMs,
  };
}

function normalizeFrequencyData(data: Uint8Array | Float32Array) {
  if (data instanceof Uint8Array) {
    return Float32Array.from(data, (value) => value / 255);
  }

  return Float32Array.from(data, (value) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value <= 0) {
      return 0;
    }
    if (value <= 1) {
      return value;
    }
    return Math.min(1, value / 255);
  });
}

function normalizeTimeDomainData(data: Uint8Array | Float32Array) {
  if (data instanceof Uint8Array) {
    return Float32Array.from(data, (value) => (value - 128) / 128);
  }

  return Float32Array.from(data, (value) => Math.max(-1, Math.min(1, value)));
}

function computeBands(spectrum: Float32Array, sampleRate: number): AudioBandFeatures {
  const nyquist = sampleRate / 2;
  const binHz = nyquist / Math.max(1, spectrum.length);
  const bands: AudioBandFeatures = {
    air: 0,
    bass: 0,
    highMid: 0,
    lowMid: 0,
    mid: 0,
    sub: 0,
  };

  for (const [name, minHz, maxHz] of BAND_LIMITS) {
    const start = Math.max(0, Math.floor(minHz / binHz));
    const end = Math.min(spectrum.length - 1, Math.ceil(maxHz / binHz));
    let total = 0;
    let count = 0;
    for (let index = start; index <= end; index += 1) {
      total += spectrum[index] ?? 0;
      count += 1;
    }
    bands[name] = count > 0 ? clamp01(total / count) : 0;
  }

  return bands;
}

function computeRms(waveform: Float32Array) {
  if (waveform.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of waveform) {
    sum += value * value;
  }
  return clamp01(Math.sqrt(sum / waveform.length));
}

function computeSpectralCentroid(spectrum: Float32Array, sampleRate: number) {
  const nyquist = sampleRate / 2;
  const binHz = nyquist / Math.max(1, spectrum.length);
  let weighted = 0;
  let total = 0;
  for (let index = 0; index < spectrum.length; index += 1) {
    const magnitude = spectrum[index] ?? 0;
    weighted += magnitude * index * binHz;
    total += magnitude;
  }
  return total > 0 ? clamp01(weighted / total / nyquist) : 0;
}

function computeSpectralFlux(
  spectrum: Float32Array,
  previousSpectrum: Float32Array | undefined,
) {
  if (!previousSpectrum || previousSpectrum.length === 0) {
    return 0;
  }

  const length = Math.min(spectrum.length, previousSpectrum.length);
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += Math.max(0, (spectrum[index] ?? 0) - (previousSpectrum[index] ?? 0));
  }
  return clamp01(total / Math.max(1, length));
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
