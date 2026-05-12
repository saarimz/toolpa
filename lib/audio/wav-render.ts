import {
  collectPatternEvents,
  collectPatternSampleIds,
  getStepDurationSec,
} from "@/lib/audio/pattern";
import { type DeclickPreset } from "@/lib/audio/declick";
import {
  resolveSamplePlaybackSegment,
  type SampleSmoothingOptions,
} from "@/lib/audio/sample-engine";
import { type SliceRegion } from "@/lib/audio/slices";
import type { Pattern } from "@/lib/pattern/schema";
import type { GlobalMusicContext } from "@/lib/music/context";
import { resolveSample } from "@/lib/samples/resolver";

export type RenderPatternWavOptions = {
  declickPreset?: DeclickPreset;
  durationSec?: number;
  sampleRate?: number;
  sliceCount?: number;
  slicesBySampleId?: Map<string, SliceRegion[]>;
  musicalContext?: GlobalMusicContext;
  zeroCrossingWindowMs?: number;
};

export async function renderPatternToWav(
  pattern: Pattern,
  options: RenderPatternWavOptions = {},
): Promise<Blob> {
  const audioBuffer = await renderPatternToAudioBuffer(pattern, options);
  return new Blob([encodeAudioBufferToWav(audioBuffer)], { type: "audio/wav" });
}

export async function renderPatternToAudioBuffer(
  pattern: Pattern,
  options: RenderPatternWavOptions = {},
): Promise<AudioBuffer> {
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("OfflineAudioContext is not available in this browser");
  }

  const sampleRate = options.sampleRate ?? 44100;
  const totalDurationSec =
    options.durationSec ??
    getStepDurationSec(pattern) * pattern.stepsPerBar * pattern.bars + 1;
  const context = new OfflineAudioContext(
    2,
    Math.ceil(totalDurationSec * sampleRate),
    sampleRate,
  );
  const outputNode = createOfflineSafetyLimiter(context);
  const samples = await Promise.all(
    collectPatternSampleIds(pattern).map(
      async (sampleId) => [sampleId, await resolveSample(sampleId)] as const,
    ),
  );
  const sampleMap = new Map(samples);

  for (const event of collectPatternEvents(pattern, {
    musicalContext: options.musicalContext,
    random: () => 0,
  })) {
    if (event.timeSec >= totalDurationSec) {
      continue;
    }

    const sample = sampleMap.get(event.sampleId);
    if (!sample) {
      continue;
    }

    const segment = resolveSamplePlaybackSegment({
      audioBuffer: sample.audioBuffer,
      event,
      options: getSampleSmoothingOptions(options),
    });
    const startTime = Math.max(0, event.timeSec);
    const releaseStart = startTime + segment.releaseStartOffsetSec;
    const endTime = startTime + segment.audibleDurationSec;
    const source = context.createBufferSource();
    const gain = context.createGain();

    source.buffer = sample.audioBuffer;
    source.playbackRate.value = event.playbackRate;
    scheduleDeclickGain(gain.gain, {
      attackSec: segment.envelope.attackSec,
      endTime,
      releaseStart,
      startTime,
      targetGain: segment.targetGain,
    });
    source.connect(gain);
    gain.connect(outputNode);
    source.start(
      startTime,
      segment.sourceOffsetSec,
      segment.sourceDurationSec,
    );
  }

  return context.startRendering();
}

export function encodeAudioBufferToWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let index = 0; index < length; index += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = audioBuffer.getChannelData(channel)[index] ?? 0;
      view.setInt16(offset, clamp16(value), true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function clamp16(value: number) {
  const clamped = Math.max(-1, Math.min(1, value));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

function getSampleSmoothingOptions(options: RenderPatternWavOptions): SampleSmoothingOptions {
  return {
    declickPreset: options.declickPreset,
    sliceCount: options.sliceCount,
    slicesBySampleId: options.slicesBySampleId,
    zeroCrossingWindowMs: options.zeroCrossingWindowMs,
  };
}

function scheduleDeclickGain(
  gain: AudioParam,
  {
    attackSec,
    endTime,
    releaseStart,
    startTime,
    targetGain,
  }: {
    attackSec: number;
    endTime: number;
    releaseStart: number;
    startTime: number;
    targetGain: number;
  },
) {
  gain.cancelScheduledValues(startTime);
  gain.setValueAtTime(0, startTime);

  if (attackSec > 0) {
    gain.linearRampToValueAtTime(targetGain, startTime + attackSec);
  } else {
    gain.setValueAtTime(targetGain, startTime);
  }

  gain.setValueAtTime(targetGain, releaseStart);
  gain.linearRampToValueAtTime(0, endTime);
}

function createOfflineSafetyLimiter(context: OfflineAudioContext): AudioNode {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-1, 0);
  limiter.knee.setValueAtTime(0, 0);
  limiter.ratio.setValueAtTime(20, 0);
  limiter.attack.setValueAtTime(0.003, 0);
  limiter.release.setValueAtTime(0.03, 0);
  limiter.connect(context.destination);
  return limiter;
}
