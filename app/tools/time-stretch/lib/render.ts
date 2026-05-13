import { createHannWindow, fft, getNearestPowerOfTwo } from "@/app/tools/time-stretch/lib/fft";
import { createSeededRandom } from "@/app/tools/time-stretch/lib/random";
import {
  getTargetDurationSec,
  getStretchRatio,
  type TimeStretchPatch,
} from "@/app/tools/time-stretch/lib/schema";

export type TimeStretchAudioBufferLike = {
  duration: number;
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
};

type AudioBufferFactory = (
  numberOfChannels: number,
  length: number,
  sampleRate: number,
) => AudioBuffer;

export type RenderTimeStretchOptions = {
  createAudioBuffer?: AudioBufferFactory;
  maxDurationSec?: number;
};

type StretchRenderInfo = {
  stretchRatio: number;
  targetDurationSec: number;
  targetLength: number;
};

const DEFAULT_MAX_DURATION_SEC = 240;
const MIN_WINDOW_SAMPLES = 128;
const MAX_GRANULAR_WINDOW_SAMPLES = 8192;
const MAX_SPECTRAL_WINDOW_SAMPLES = 16384;

export async function renderTimeStretchToAudioBuffer(
  source: TimeStretchAudioBufferLike,
  patch: TimeStretchPatch,
  options: RenderTimeStretchOptions = {},
): Promise<AudioBuffer> {
  const renderInfo = getStretchRenderInfo(source, patch, {
    maxDurationSec: options.maxDurationSec,
  });
  const outputChannels = Math.max(1, Math.min(2, source.numberOfChannels));
  const audioBuffer = createOutputBuffer(
    outputChannels,
    renderInfo.targetLength,
    source.sampleRate,
    options.createAudioBuffer,
  );
  const seed = patch.seed + Math.round(renderInfo.stretchRatio * 1000);

  for (let channel = 0; channel < outputChannels; channel += 1) {
    const input = source.getChannelData(Math.min(channel, source.numberOfChannels - 1));
    const output =
      patch.mode === "ambient-cloud" || patch.mode === "spectral-freeze"
        ? paulStretchChannelData(input, source.sampleRate, renderInfo, patch, seed + channel)
        : granularStretchChannelData(input, source.sampleRate, renderInfo, patch, seed + channel);

    audioBuffer.getChannelData(channel).set(output);
  }

  applyToneLayers(audioBuffer, patch);
  applyPerformanceMovement(audioBuffer, patch);
  applyStereoWidth(audioBuffer, patch.stereoWidth);
  normalizeAudioBuffer(audioBuffer);

  return audioBuffer;
}

export function getStretchRenderInfo(
  source: Pick<TimeStretchAudioBufferLike, "duration" | "sampleRate">,
  patch: Pick<TimeStretchPatch, "bpm" | "targetBars">,
  options: { maxDurationSec?: number } = {},
): StretchRenderInfo {
  const maxDurationSec = options.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC;
  const targetDurationSec = Math.min(
    maxDurationSec,
    getTargetDurationSec({
      bpm: patch.bpm,
      targetBars: patch.targetBars,
    }),
  );

  return {
    stretchRatio: getStretchRatio({
      sourceDurationSec: source.duration,
      targetDurationSec,
    }),
    targetDurationSec,
    targetLength: Math.max(1, Math.ceil(targetDurationSec * source.sampleRate)),
  };
}

export function granularStretchChannelData(
  input: Float32Array,
  sampleRate: number,
  renderInfo: StretchRenderInfo,
  patch: TimeStretchPatch,
  seed = patch.seed,
): Float32Array {
  const output = new Float32Array(renderInfo.targetLength);
  const weights = new Float32Array(renderInfo.targetLength);
  const random = createSeededRandom(seed);
  const windowSize = getWindowSamples(
    patch.windowMs,
    sampleRate,
    MAX_GRANULAR_WINDOW_SAMPLES,
  );
  const window = createHannWindow(windowSize);
  const hopOut = Math.max(32, Math.floor(windowSize * getGranularHopRatio(patch)));
  const pitchRatio = 2 ** (patch.pitchSemitones / 12);
  const sourceHop = Math.max(1, hopOut / Math.max(0.001, renderInfo.stretchRatio));
  const searchRadius =
    patch.mode === "rhythmic" || patch.transientMode === "preserve"
      ? Math.floor(windowSize * 0.35)
      : 0;
  let previousSourceStart = -1;

  for (let outputStart = 0; outputStart < output.length + windowSize; outputStart += hopOut) {
    const expectedSourceStart = clampSourceStart(
      (outputStart / Math.max(0.001, renderInfo.stretchRatio)) * pitchRatio,
      input.length,
      windowSize,
    );
    const jitter =
      patch.mode === "granular-smear"
        ? (random() - 0.5) * windowSize * (0.2 + patch.texture * 0.85)
        : 0;
    const sourceStart =
      searchRadius > 0 && previousSourceStart >= 0
        ? findBestContinuationStart({
            expectedSourceStart: expectedSourceStart + jitter,
            input,
            overlapSize: Math.min(Math.floor(windowSize * 0.35), 512),
            previousSourceStart,
            searchRadius,
            sourceHop,
            windowSize,
          })
        : clampSourceStart(expectedSourceStart + jitter, input.length, windowSize);

    overlapAddGrain({
      input,
      output,
      outputStart,
      pitchRatio,
      sourceStart,
      weights,
      window,
    });
    previousSourceStart = sourceStart;
  }

  finishOverlapAdd(output, weights);
  return output;
}

export function paulStretchChannelData(
  input: Float32Array,
  sampleRate: number,
  renderInfo: StretchRenderInfo,
  patch: TimeStretchPatch,
  seed = patch.seed,
): Float32Array {
  const output = new Float32Array(renderInfo.targetLength);
  const weights = new Float32Array(renderInfo.targetLength);
  const random = createSeededRandom(seed);
  const windowSize = getWindowSamples(
    Math.max(patch.windowMs, patch.mode === "spectral-freeze" ? 520 : 180),
    sampleRate,
    MAX_SPECTRAL_WINDOW_SAMPLES,
  );
  const window = createHannWindow(windowSize);
  const hopOut = Math.max(64, Math.floor(windowSize * (0.16 + (1 - patch.spectralBlur) * 0.1)));
  const real = new Float32Array(windowSize);
  const imag = new Float32Array(windowSize);
  const magnitudes = new Float32Array(windowSize);
  const pitchRatio = 2 ** (patch.pitchSemitones / 12);
  const sourceSpan = Math.max(1, input.length - windowSize);

  for (let outputStart = 0; outputStart < output.length + windowSize; outputStart += hopOut) {
    const progress = Math.max(0, Math.min(1, outputStart / Math.max(1, output.length - 1)));
    const scanPosition =
      patch.mode === "spectral-freeze"
        ? patch.freezePosition
        : Math.min(1, progress * pitchRatio);
    const jitter = (random() - 0.5) * windowSize * patch.texture * 0.45;
    const sourceStart = clampSourceStart(
      scanPosition * sourceSpan + jitter,
      input.length,
      windowSize,
    );

    real.fill(0);
    imag.fill(0);
    for (let index = 0; index < windowSize; index += 1) {
      real[index] = sampleLinear(input, sourceStart + index) * (window[index] ?? 0);
    }

    fft(real, imag);
    for (let index = 0; index < windowSize; index += 1) {
      magnitudes[index] = Math.hypot(real[index] ?? 0, imag[index] ?? 0);
    }
    blurMagnitudes(magnitudes, patch.spectralBlur);
    randomizePhases({
      blur: patch.spectralBlur,
      imag,
      magnitudes,
      random,
      real,
    });
    fft(real, imag, true);

    for (let index = 0; index < windowSize; index += 1) {
      const outputIndex = outputStart + index - Math.floor(windowSize / 2);
      if (outputIndex < 0 || outputIndex >= output.length) {
        continue;
      }
      const weight = window[index] ?? 0;
      output[outputIndex] += (real[index] ?? 0) * weight;
      weights[outputIndex] += weight * weight;
    }
  }

  finishOverlapAdd(output, weights);
  return output;
}

export function createSubharmonicLayer(
  input: Float32Array,
  sampleRate: number,
  mix: number,
): Float32Array {
  const output = new Float32Array(input.length);
  if (mix <= 0) {
    return output;
  }

  const low = lowpass(input, sampleRate, 420);
  let dividerSign = 1;
  let crossings = 0;
  let previous = low[0] ?? 0;
  for (let index = 0; index < low.length; index += 1) {
    const value = low[index] ?? 0;
    if (previous <= 0 && value > 0) {
      crossings += 1;
      if (crossings % 2 === 0) {
        dividerSign *= -1;
      }
    }
    previous = value;
    output[index] = Math.abs(value) * dividerSign * mix;
  }

  return lowpass(output, sampleRate, 180);
}

function getGranularHopRatio(patch: TimeStretchPatch) {
  if (patch.mode === "rhythmic") {
    return patch.transientMode === "preserve" ? 0.2 : 0.25;
  }
  if (patch.mode === "granular-smear") {
    return 0.12 + (1 - patch.texture) * 0.1;
  }
  return 0.2;
}

function getWindowSamples(windowMs: number, sampleRate: number, maxWindowSamples: number) {
  const requested = (windowMs / 1000) * sampleRate;
  return Math.max(
    MIN_WINDOW_SAMPLES,
    Math.min(maxWindowSamples, getNearestPowerOfTwo(requested)),
  );
}

function overlapAddGrain({
  input,
  output,
  outputStart,
  pitchRatio,
  sourceStart,
  weights,
  window,
}: {
  input: Float32Array;
  output: Float32Array;
  outputStart: number;
  pitchRatio: number;
  sourceStart: number;
  weights: Float32Array;
  window: Float32Array;
}) {
  for (let index = 0; index < window.length; index += 1) {
    const outputIndex = outputStart + index - Math.floor(window.length / 2);
    if (outputIndex < 0 || outputIndex >= output.length) {
      continue;
    }
    const weight = window[index] ?? 0;
    const value = sampleLinear(input, sourceStart + index * pitchRatio);
    output[outputIndex] += value * weight;
    weights[outputIndex] += weight;
  }
}

function finishOverlapAdd(output: Float32Array, weights: Float32Array) {
  for (let index = 0; index < output.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (weight > 1e-5) {
      output[index] = (output[index] ?? 0) / weight;
    }
  }
  fadeEdges(output, Math.min(2048, Math.floor(output.length / 16)));
}

function findBestContinuationStart({
  expectedSourceStart,
  input,
  overlapSize,
  previousSourceStart,
  searchRadius,
  sourceHop,
  windowSize,
}: {
  expectedSourceStart: number;
  input: Float32Array;
  overlapSize: number;
  previousSourceStart: number;
  searchRadius: number;
  sourceHop: number;
  windowSize: number;
}) {
  const idealContinuation = previousSourceStart + sourceHop;
  let bestStart = clampSourceStart(expectedSourceStart, input.length, windowSize);
  let bestScore = Number.NEGATIVE_INFINITY;
  const step = Math.max(8, Math.floor(searchRadius / 12));

  for (let offset = -searchRadius; offset <= searchRadius; offset += step) {
    const candidate = clampSourceStart(expectedSourceStart + offset, input.length, windowSize);
    let dot = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;

    for (let index = 0; index < overlapSize; index += 1) {
      const left = sampleLinear(input, candidate + index);
      const right = sampleLinear(input, idealContinuation + index);
      dot += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }

    const continuityPenalty = Math.abs(candidate - idealContinuation) / Math.max(1, searchRadius);
    const score = dot / Math.sqrt(Math.max(1e-9, leftEnergy * rightEnergy)) - continuityPenalty * 0.08;
    if (score > bestScore) {
      bestScore = score;
      bestStart = candidate;
    }
  }

  return bestStart;
}

function blurMagnitudes(magnitudes: Float32Array, amount: number) {
  if (amount <= 0) {
    return;
  }

  const copy = new Float32Array(magnitudes);
  const radius = Math.max(1, Math.floor(amount * 5));
  for (let index = 0; index < magnitudes.length; index += 1) {
    let sum = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = copy[index + offset];
      if (value === undefined) {
        continue;
      }
      sum += value;
      count += 1;
    }
    const average = sum / Math.max(1, count);
    magnitudes[index] = (copy[index] ?? 0) * (1 - amount) + average * amount;
  }
}

function randomizePhases({
  blur,
  imag,
  magnitudes,
  random,
  real,
}: {
  blur: number;
  imag: Float32Array;
  magnitudes: Float32Array;
  random: () => number;
  real: Float32Array;
}) {
  real[0] = magnitudes[0] ?? 0;
  imag[0] = 0;
  const half = Math.floor(real.length / 2);
  for (let bin = 1; bin <= half; bin += 1) {
    const magnitude = magnitudes[bin] ?? 0;
    const phaseNoise = (random() - 0.5) * Math.PI * 2;
    const phase = phaseNoise * (0.65 + blur * 0.35);
    const binReal = magnitude * Math.cos(phase);
    const binImag = magnitude * Math.sin(phase);
    real[bin] = binReal;
    imag[bin] = binImag;

    const mirror = real.length - bin;
    if (mirror !== bin && mirror < real.length) {
      real[mirror] = binReal;
      imag[mirror] = -binImag;
    }
  }
}

function applyToneLayers(audioBuffer: AudioBuffer, patch: TimeStretchPatch) {
  const wantsBloom =
    patch.mode === "subharmonic-bloom" ||
    patch.octaveDownMix > 0 ||
    patch.subharmonicMix > 0;
  if (!wantsBloom) {
    return;
  }

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const output = audioBuffer.getChannelData(channel);
    const octave = createOctaveDownLayer(output, audioBuffer.sampleRate, patch.octaveDownMix);
    const sub = createSubharmonicLayer(output, audioBuffer.sampleRate, patch.subharmonicMix);
    for (let index = 0; index < output.length; index += 1) {
      output[index] = (output[index] ?? 0) + (octave[index] ?? 0) + (sub[index] ?? 0);
    }
  }
}

function applyPerformanceMovement(audioBuffer: AudioBuffer, patch: TimeStretchPatch) {
  const mode = patch.performanceMode;
  const active =
    mode !== "none" ||
    patch.movementDepth > 0 ||
    patch.degradation > 0 ||
    patch.wowFlutter > 0 ||
    patch.dropoutAmount > 0 ||
    patch.noiseAmount > 0 ||
    patch.filterDrift > 0 ||
    patch.subMotion > 0;

  if (!active) {
    return;
  }

  const modeDepth = getPerformanceModeDepth(mode);
  const movementDepth = Math.max(patch.movementDepth, modeDepth);
  const random = createSeededRandom(patch.seed + 9127);

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    const original = new Float32Array(data);

    if (patch.wowFlutter > 0 || mode === "broken-tape" || mode === "disintegration-loop") {
      applyWowFlutter(data, original, audioBuffer.sampleRate, {
        amount: Math.max(patch.wowFlutter, mode === "broken-tape" ? 0.42 : 0),
        channel,
        depth: movementDepth,
        seed: patch.seed,
      });
    }

    if (patch.subMotion > 0 || mode === "low-end-tide") {
      applySubTide(data, original, audioBuffer.sampleRate, {
        depth: movementDepth,
        octaveMix: patch.octaveDownMix,
        seed: patch.seed,
        subMix: Math.max(patch.subharmonicMix, mode === "low-end-tide" ? 0.22 : 0),
        subMotion: Math.max(patch.subMotion, mode === "low-end-tide" ? 0.55 : 0),
      });
    }

    if (
      patch.filterDrift > 0 ||
      patch.degradation > 0 ||
      mode === "disintegration-loop" ||
      mode === "spectral-erosion" ||
      mode === "memory-decay"
    ) {
      applyDynamicLowpass(data, audioBuffer.sampleRate, {
        degradation: Math.max(patch.degradation, getModeDegradation(mode)),
        depth: movementDepth,
        filterDrift: Math.max(patch.filterDrift, getModeFilterDrift(mode)),
        mode,
        seed: patch.seed + channel * 101,
      });
    }

    if (patch.dropoutAmount > 0 || mode === "broken-tape" || mode === "disintegration-loop") {
      applyDropouts(data, audioBuffer.sampleRate, {
        amount: Math.max(patch.dropoutAmount, mode === "broken-tape" ? 0.18 : 0),
        depth: movementDepth,
        random,
      });
    }

    if (patch.noiseAmount > 0 || mode === "disintegration-loop" || mode === "broken-tape") {
      applyNoise(data, {
        amount: Math.max(
          patch.noiseAmount,
          mode === "disintegration-loop" ? 0.08 : mode === "broken-tape" ? 0.05 : 0,
        ),
        depth: movementDepth,
        mode,
        random,
      });
    }

    if (mode === "cloud-orbit") {
      applyAmplitudeDrift(data, audioBuffer.sampleRate, {
        amount: 0.08 + movementDepth * 0.12,
        channel,
        seed: patch.seed,
      });
    }
  }
}

function createOctaveDownLayer(input: Float32Array, sampleRate: number, mix: number) {
  const output = new Float32Array(input.length);
  if (mix <= 0) {
    return output;
  }

  for (let index = 0; index < output.length; index += 1) {
    output[index] = sampleWrapped(input, index * 0.5) * mix;
  }
  return lowpass(output, sampleRate, 360);
}

function applyWowFlutter(
  data: Float32Array,
  source: Float32Array,
  sampleRate: number,
  {
    amount,
    channel,
    depth,
    seed,
  }: {
    amount: number;
    channel: number;
    depth: number;
    seed: number;
  },
) {
  const maxDelaySamples = sampleRate * (0.0015 + amount * depth * 0.012);
  const phase = (seed % 997) / 997 + channel * 0.31;
  for (let index = 0; index < data.length; index += 1) {
    const time = index / sampleRate;
    const slow = Math.sin(2 * Math.PI * (0.025 + amount * 0.055) * time + phase);
    const flutter = Math.sin(2 * Math.PI * (0.82 + amount * 2.2) * time + phase * 3.7);
    const drift = (slow * 0.72 + flutter * 0.28) * maxDelaySamples;
    data[index] = sampleLinear(source, index + drift);
  }
}

function applySubTide(
  data: Float32Array,
  source: Float32Array,
  sampleRate: number,
  {
    depth,
    octaveMix,
    seed,
    subMix,
    subMotion,
  }: {
    depth: number;
    octaveMix: number;
    seed: number;
    subMix: number;
    subMotion: number;
  },
) {
  const octave = createOctaveDownLayer(source, sampleRate, octaveMix * subMotion);
  const sub = createSubharmonicLayer(source, sampleRate, subMix * subMotion);
  const phase = (seed % 577) / 577;
  for (let index = 0; index < data.length; index += 1) {
    const progress = index / Math.max(1, data.length - 1);
    const tide =
      0.45 +
      0.35 * Math.sin(2 * Math.PI * (progress * (1.25 + depth * 1.8) + phase)) +
      0.2 * Math.sin(2 * Math.PI * (progress * 0.27 + phase * 0.5));
    const gain = Math.max(0, Math.min(1, tide)) * depth;
    data[index] = (data[index] ?? 0) + ((octave[index] ?? 0) + (sub[index] ?? 0)) * gain;
  }
}

function applyDynamicLowpass(
  data: Float32Array,
  sampleRate: number,
  {
    degradation,
    depth,
    filterDrift,
    mode,
    seed,
  }: {
    degradation: number;
    depth: number;
    filterDrift: number;
    mode: TimeStretchPatch["performanceMode"];
    seed: number;
  },
) {
  const baseCutoff = mode === "spectral-erosion" ? 7600 : 12000;
  const endCutoff =
    mode === "spectral-erosion"
      ? 520
      : mode === "memory-decay"
        ? 920
        : mode === "disintegration-loop"
          ? 780
          : 2600;
  const phase = (seed % 389) / 389;
  let state = data[0] ?? 0;

  for (let index = 0; index < data.length; index += 1) {
    const progress = index / Math.max(1, data.length - 1);
    const erode = Math.pow(progress, 0.75) * degradation * depth;
    const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * (progress * 2.35 + phase));
    const drift = filterDrift * depth * (0.35 + 0.65 * lfo);
    const cutoff = Math.max(120, baseCutoff - (baseCutoff - endCutoff) * Math.max(erode, drift * 0.65));
    const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    state += alpha * ((data[index] ?? 0) - state);
    const blend = Math.max(erode, drift * 0.45);
    data[index] = (data[index] ?? 0) * (1 - blend) + state * blend;
  }
}

function applyDropouts(
  data: Float32Array,
  sampleRate: number,
  {
    amount,
    depth,
    random,
  }: {
    amount: number;
    depth: number;
    random: () => number;
  },
) {
  const blockSize = Math.max(128, Math.floor(sampleRate * 0.18));
  let gain = 1;
  let targetGain = 1;
  for (let index = 0; index < data.length; index += 1) {
    if (index % blockSize === 0) {
      const progress = index / Math.max(1, data.length - 1);
      const chance = amount * depth * (0.12 + progress * 0.32);
      targetGain = random() < chance ? 0.18 + random() * 0.52 : 1;
    }
    gain += (targetGain - gain) * 0.0025;
    data[index] = (data[index] ?? 0) * gain;
  }
}

function applyNoise(
  data: Float32Array,
  {
    amount,
    depth,
    mode,
    random,
  }: {
    amount: number;
    depth: number;
    mode: TimeStretchPatch["performanceMode"];
    random: () => number;
  },
) {
  let noiseState = 0;
  for (let index = 0; index < data.length; index += 1) {
    const progress = index / Math.max(1, data.length - 1);
    const growth =
      mode === "disintegration-loop" || mode === "memory-decay"
        ? 0.25 + progress * 0.75
        : 0.55;
    noiseState += ((random() * 2 - 1) - noiseState) * 0.04;
    data[index] = (data[index] ?? 0) + noiseState * amount * depth * growth;
  }
}

function applyAmplitudeDrift(
  data: Float32Array,
  sampleRate: number,
  {
    amount,
    channel,
    seed,
  }: {
    amount: number;
    channel: number;
    seed: number;
  },
) {
  const phase = (seed % 811) / 811 + channel * 0.5;
  for (let index = 0; index < data.length; index += 1) {
    const time = index / sampleRate;
    const drift =
      1 -
      amount * 0.5 +
      amount * 0.5 * Math.sin(2 * Math.PI * 0.018 * time + phase) +
      amount * 0.25 * Math.sin(2 * Math.PI * 0.047 * time + phase * 2);
    data[index] = (data[index] ?? 0) * drift;
  }
}

function getPerformanceModeDepth(mode: TimeStretchPatch["performanceMode"]) {
  if (mode === "none") {
    return 0;
  }
  if (mode === "disintegration-loop" || mode === "memory-decay") {
    return 0.72;
  }
  if (mode === "broken-tape" || mode === "low-end-tide") {
    return 0.58;
  }
  return 0.48;
}

function getModeDegradation(mode: TimeStretchPatch["performanceMode"]) {
  if (mode === "disintegration-loop") {
    return 0.68;
  }
  if (mode === "memory-decay" || mode === "spectral-erosion") {
    return 0.58;
  }
  return 0;
}

function getModeFilterDrift(mode: TimeStretchPatch["performanceMode"]) {
  if (mode === "disintegration-loop" || mode === "spectral-erosion") {
    return 0.62;
  }
  if (mode === "memory-decay" || mode === "cloud-orbit") {
    return 0.42;
  }
  return 0;
}

function lowpass(input: Float32Array, sampleRate: number, cutoffHz: number) {
  const output = new Float32Array(input.length);
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let state = 0;
  for (let index = 0; index < input.length; index += 1) {
    state += alpha * ((input[index] ?? 0) - state);
    output[index] = state;
  }
  return output;
}

function applyStereoWidth(audioBuffer: AudioBuffer, width: number) {
  if (audioBuffer.numberOfChannels < 2 || width === 1) {
    return;
  }

  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);
  for (let index = 0; index < left.length; index += 1) {
    const mid = ((left[index] ?? 0) + (right[index] ?? 0)) * 0.5;
    const side = ((left[index] ?? 0) - (right[index] ?? 0)) * 0.5 * width;
    left[index] = mid + side;
    right[index] = mid - side;
  }
}

function normalizeAudioBuffer(audioBuffer: AudioBuffer) {
  let peak = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      peak = Math.max(peak, Math.abs(data[index] ?? 0));
    }
  }

  if (peak <= 0.98) {
    return;
  }

  const gain = 0.98 / peak;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (data[index] ?? 0) * gain;
    }
  }
}

function fadeEdges(data: Float32Array, fadeLength: number) {
  if (fadeLength <= 0) {
    return;
  }

  for (let index = 0; index < fadeLength; index += 1) {
    const gain = index / fadeLength;
    data[index] = (data[index] ?? 0) * gain;
    const tailIndex = data.length - 1 - index;
    if (tailIndex >= 0) {
      data[tailIndex] = (data[tailIndex] ?? 0) * gain;
    }
  }
}

function sampleLinear(input: Float32Array, position: number) {
  if (input.length === 0) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(input.length - 1, position));
  const leftIndex = Math.floor(clamped);
  const rightIndex = Math.min(input.length - 1, leftIndex + 1);
  const fraction = clamped - leftIndex;
  return (input[leftIndex] ?? 0) * (1 - fraction) + (input[rightIndex] ?? 0) * fraction;
}

function sampleWrapped(input: Float32Array, position: number) {
  if (input.length === 0) {
    return 0;
  }
  const wrapped = ((position % input.length) + input.length) % input.length;
  const leftIndex = Math.floor(wrapped);
  const rightIndex = (leftIndex + 1) % input.length;
  const fraction = wrapped - leftIndex;
  return (input[leftIndex] ?? 0) * (1 - fraction) + (input[rightIndex] ?? 0) * fraction;
}

function clampSourceStart(position: number, inputLength: number, windowSize: number) {
  return Math.max(0, Math.min(Math.max(0, inputLength - windowSize), position));
}

function createOutputBuffer(
  numberOfChannels: number,
  length: number,
  sampleRate: number,
  factory?: AudioBufferFactory,
) {
  if (factory) {
    return factory(numberOfChannels, length, sampleRate);
  }

  if (typeof OfflineAudioContext !== "undefined") {
    return new OfflineAudioContext(numberOfChannels, 1, sampleRate).createBuffer(
      numberOfChannels,
      length,
      sampleRate,
    );
  }

  if (typeof AudioContext !== "undefined") {
    return new AudioContext().createBuffer(numberOfChannels, length, sampleRate);
  }

  throw new Error("AudioBuffer creation is not available in this browser");
}
