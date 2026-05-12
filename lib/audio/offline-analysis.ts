export type AudioBufferLike = {
  duration: number;
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
};

export type AudioBufferAnalysisOptions = {
  expectedDurationSec?: number;
  maxClippedRatio?: number;
  maxDurationDeltaSec?: number;
  maxPeak?: number;
  minRms?: number;
};

export type AudioBufferAnalysis = {
  clipped: number;
  clippedRatio: number;
  durationDeltaSec?: number;
  hasNaN: boolean;
  ok: boolean;
  peak: number;
  reasons: string[];
  rms: number;
  sampleCount: number;
};

const DEFAULT_MIN_RMS = 1e-4;
const DEFAULT_MAX_PEAK = 1;
const DEFAULT_MAX_CLIPPED_RATIO = 0.001;
const DEFAULT_MAX_DURATION_DELTA_SEC = 0.05;
const CLIP_THRESHOLD = 0.999;

export function analyzeAudioBuffer(
  buffer: AudioBufferLike,
  options: AudioBufferAnalysisOptions = {},
): AudioBufferAnalysis {
  const reasons: string[] = [];
  let clipped = 0;
  let hasNaN = false;
  let peak = 0;
  let sampleCount = 0;
  let sumSquares = 0;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const value = data[index] ?? 0;
      if (!Number.isFinite(value)) {
        hasNaN = true;
        continue;
      }

      const magnitude = Math.abs(value);
      peak = Math.max(peak, magnitude);
      if (magnitude >= CLIP_THRESHOLD) {
        clipped += 1;
      }
      sumSquares += value * value;
      sampleCount += 1;
    }
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  const clippedRatio = clipped / Math.max(1, sampleCount);
  const minRms = options.minRms ?? DEFAULT_MIN_RMS;
  const maxPeak = options.maxPeak ?? DEFAULT_MAX_PEAK;
  const maxClippedRatio = options.maxClippedRatio ?? DEFAULT_MAX_CLIPPED_RATIO;
  const durationDeltaSec =
    typeof options.expectedDurationSec === "number"
      ? Math.abs(buffer.duration - options.expectedDurationSec)
      : undefined;

  if (hasNaN) {
    reasons.push("buffer contains NaN or Infinity");
  }
  if (rms < minRms) {
    reasons.push(`silent output: rms=${rms.toExponential(2)}`);
  }
  if (peak >= maxPeak) {
    reasons.push(`peak exceeds limit: ${peak.toFixed(3)}`);
  }
  if (clippedRatio > maxClippedRatio) {
    reasons.push(
      `too many clipped samples: ${clipped}/${sampleCount} (${clippedRatio.toFixed(4)})`,
    );
  }
  if (
    durationDeltaSec !== undefined &&
    durationDeltaSec > (options.maxDurationDeltaSec ?? DEFAULT_MAX_DURATION_DELTA_SEC)
  ) {
    reasons.push(
      `duration mismatch: ${buffer.duration.toFixed(3)}s vs ${options.expectedDurationSec?.toFixed(3)}s`,
    );
  }

  return {
    clipped,
    clippedRatio,
    durationDeltaSec,
    hasNaN,
    ok: reasons.length === 0,
    peak,
    reasons,
    rms,
    sampleCount,
  };
}
