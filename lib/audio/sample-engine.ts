import { getAudioBufferChannelData } from "@/lib/audio/buffer-data";
import {
  getAudibleDurationSec,
  getDeclickEnvelope,
  type DeclickEnvelope,
  type DeclickPreset,
} from "@/lib/audio/declick";
import type { ScheduledStepEvent } from "@/lib/audio/pattern";
import {
  computeEqualSlices,
  getSliceForSlot,
  snapSliceRegionsToZeroCrossings,
  type SliceRegion,
} from "@/lib/audio/slices";

export type SampleSmoothingOptions = {
  declickPreset?: DeclickPreset;
  sliceCount?: number;
  slicesBySampleId?: Map<string, SliceRegion[]>;
  zeroCrossingWindowMs?: number;
};

export type SamplePlaybackSegment = {
  audibleDurationSec: number;
  envelope: DeclickEnvelope;
  releaseStartOffsetSec: number;
  slice: SliceRegion;
  sourceDurationSec: number;
  sourceOffsetSec: number;
  targetGain: number;
};

export function getSmoothedSampleSlices({
  audioBuffer,
  sampleId,
  sliceCount,
  slicesBySampleId,
  zeroCrossingWindowMs,
}: {
  audioBuffer: AudioBuffer;
  sampleId: string;
} & SampleSmoothingOptions): SliceRegion[] {
  const bufferData = getAudioBufferChannelData(audioBuffer);
  const existingSlices = slicesBySampleId?.get(sampleId);

  if (existingSlices && bufferData) {
    return snapSliceRegionsToZeroCrossings({
      channelData: bufferData.channelData,
      durationSec: audioBuffer.duration,
      sampleRate: bufferData.sampleRate,
      slices: existingSlices,
      windowMs: zeroCrossingWindowMs,
    });
  }

  if (existingSlices) {
    return existingSlices;
  }

  return computeEqualSlices({
    channelData: bufferData?.channelData,
    durationSec: audioBuffer.duration,
    sampleRate: bufferData?.sampleRate,
    sourceSampleId: sampleId,
    sliceCount,
    zeroCrossingWindowMs,
  });
}

export function resolveSamplePlaybackSegment({
  audioBuffer,
  event,
  options = {},
}: {
  audioBuffer: AudioBuffer;
  event: Pick<
    ScheduledStepEvent,
    "durationSec" | "gain" | "playbackRate" | "reverse" | "sampleId" | "slot" | "velocity"
  >;
  options?: SampleSmoothingOptions;
}): SamplePlaybackSegment {
  const slices = getSmoothedSampleSlices({
    audioBuffer,
    sampleId: event.sampleId,
    ...options,
  });
  const slice = getSliceForSlot(slices, event.slot);
  const sourceDurationSec = Math.min(slice.durationSec, event.durationSec);
  const audibleDurationSec = getAudibleDurationSec(sourceDurationSec, event.playbackRate);
  const envelope = getDeclickEnvelope({
    durationSec: audibleDurationSec,
    preset: options.declickPreset,
  });

  return {
    audibleDurationSec,
    envelope,
    releaseStartOffsetSec: Math.max(0, audibleDurationSec - envelope.releaseSec),
    slice,
    sourceDurationSec,
    sourceOffsetSec: getSourceOffsetSec({
      bufferDurationSec: audioBuffer.duration,
      reverse: event.reverse,
      slice,
    }),
    targetGain: Math.max(0, event.velocity * event.gain),
  };
}

function getSourceOffsetSec({
  bufferDurationSec,
  reverse,
  slice,
}: {
  bufferDurationSec: number;
  reverse: boolean;
  slice: SliceRegion;
}) {
  if (!reverse) {
    return slice.startSec;
  }

  return Math.max(0, bufferDurationSec - slice.endSec);
}
