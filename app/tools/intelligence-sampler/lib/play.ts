"use client";

import {
  collectPatternPlaybackPlan,
  getStepDurationSec,
  type PatternStepTraceEvent,
} from "@/lib/audio/pattern";
import { getAudioBufferChannelData } from "@/lib/audio/buffer-data";
import {
  getAudibleDurationSec,
  getDeclickEnvelope,
  type DeclickPreset,
} from "@/lib/audio/declick";
import { publishPatternPlaybackTrace } from "@/lib/audio/playback-agency";
import type { Pattern } from "@/lib/pattern/schema";
import type { GlobalMusicContext } from "@/lib/music/context";
import { resolveSample } from "@/lib/samples/resolver";
import {
  createSliceSampleId,
  computeEqualSlices,
  getSliceForSlot,
  snapSliceRegionsToZeroCrossings,
  type SliceRegion,
} from "@/lib/audio/slices";

type ToneModule = typeof import("tone");
type TonePlayer = InstanceType<ToneModule["Player"]>;
type ToneLimiter = InstanceType<ToneModule["Limiter"]>;
type ToneTransportTime = Parameters<TonePlayer["stop"]>[0];
type DisposablePart = {
  loop: boolean | number;
  loopEnd: unknown;
  start: (time?: number) => unknown;
  stop: () => unknown;
  dispose: () => unknown;
};

let activePart: DisposablePart | null = null;
let activeTracePart: DisposablePart | null = null;
let activeOutputNode: ToneLimiter | null = null;
const activePlayers = new Set<TonePlayer>();
const activeChokePlayers = new Map<string, TonePlayer>();
const disposeTimers = new Set<ReturnType<typeof setTimeout>>();

export type SlicedPlaybackOptions = {
  declickPreset?: DeclickPreset;
  sliceCount?: number;
  slicesBySampleId?: Map<string, SliceRegion[]>;
  musicalContext?: GlobalMusicContext;
};

export function createIntelligenceSamplerPlayerKey(sampleId: string, slot: number) {
  return createSliceSampleId(sampleId, slot);
}

export function clearIntelligenceSamplerPlaybackState() {
  for (const timer of disposeTimers) {
    clearTimeout(timer);
  }
  disposeTimers.clear();

  for (const player of activePlayers) {
    player.stop();
    player.dispose();
  }
  activePlayers.clear();
  activeChokePlayers.clear();
  activeOutputNode?.dispose();
  activeOutputNode = null;
}

export async function playIntelligenceSamplerPattern(
  pattern: Pattern,
  options: SlicedPlaybackOptions = {},
) {
  const Tone = await import("tone");
  await Tone.start();
  await stopIntelligenceSamplerPattern();

  const transport = Tone.getTransport();
  transport.bpm.value = pattern.bpm;
  transport.swing = pattern.swing;
  transport.swingSubdivision = "16n";
  const outputNode = createSampleOutputNode(Tone);
  activeOutputNode = outputNode;

  const sampleIds = [...new Set(pattern.tracks.map((track) => track.sampleId))];
  const samples = await Promise.all(
    sampleIds.map(async (sampleId) => [sampleId, await resolveSample(sampleId)] as const),
  );
  const sampleMap = new Map(samples);

  const { events, traces } = collectPatternPlaybackPlan(pattern, {
    musicalContext: options.musicalContext,
    random: Math.random,
  });
  const eventEntries = events.map((event) => [event.timeSec, event] as const);
  const traceEntries = traces.map((event) => [event.timeSec, event] as const);
  activeChokePlayers.clear();

  const tracePart = new Tone.Part((_time, event: PatternStepTraceEvent) => {
    publishPatternPlaybackTrace(event);
  }, traceEntries);

  const part = new Tone.Part((time, event) => {
    const sample = sampleMap.get(event.sampleId);
    if (!sample) {
      return;
    }

    const slices = getPlayableSlices({
      audioBuffer: sample.audioBuffer,
      sampleId: event.sampleId,
      sliceCount: options.sliceCount,
      slicesBySampleId: options.slicesBySampleId,
    });
    const slice = getSliceForSlot(slices, event.slot);
    const player = new Tone.Player(sample.audioBuffer).connect(outputNode);
    const gain = Math.max(0.0001, event.velocity * event.gain);
    const durationSec = Math.min(slice.durationSec, event.durationSec);
    const audibleDurationSec = getAudibleDurationSec(durationSec, event.playbackRate);
    const envelope = getDeclickEnvelope({
      durationSec: audibleDurationSec,
      preset: options.declickPreset,
    });
    const fadeOutStart = Math.max(
      Number(time),
      Number(time) + audibleDurationSec - envelope.releaseSec,
    );

    player.reverse = event.reverse;
    player.fadeIn = envelope.attackSec;
    player.fadeOut = envelope.releaseSec;
    player.playbackRate = event.playbackRate;
    player.volume.value = Tone.gainToDb(gain);
    activePlayers.add(player);

    if (event.chokeGroup) {
      activeChokePlayers.get(event.chokeGroup)?.stop(time as ToneTransportTime);
      activeChokePlayers.set(event.chokeGroup, player);
    }
    player.start(time, slice.startSec);
    player.stop(fadeOutStart as ToneTransportTime);

    const disposeTimer = setTimeout(
      () => {
        if (event.chokeGroup && activeChokePlayers.get(event.chokeGroup) === player) {
          activeChokePlayers.delete(event.chokeGroup);
        }
        player.dispose();
        activePlayers.delete(player);
        disposeTimers.delete(disposeTimer);
      },
      Math.max(250, (audibleDurationSec + envelope.releaseSec) * 1000 + 100),
    );
    disposeTimers.add(disposeTimer);
  }, eventEntries);

  part.loop = true;
  part.loopEnd = getStepDurationSec(pattern) * pattern.stepsPerBar * pattern.bars;
  tracePart.loop = true;
  tracePart.loopEnd = part.loopEnd;
  tracePart.start(0);
  part.start(0);
  activePart = part;
  activeTracePart = tracePart;

  transport.stop();
  transport.position = 0;
  transport.start();
}

export async function auditionIntelligenceSamplerSlice(
  sampleId: string,
  slot: number,
  options: SlicedPlaybackOptions = {},
) {
  const Tone = await import("tone");
  await Tone.start();
  const sample = await resolveSample(sampleId);
  const outputNode = createSampleOutputNode(Tone);
  const player = new Tone.Player(sample.audioBuffer).connect(outputNode);
  const slices = getPlayableSlices({
    audioBuffer: sample.audioBuffer,
    sampleId,
    sliceCount: options.sliceCount,
    slicesBySampleId: options.slicesBySampleId,
  });
  const slice = getSliceForSlot(slices, slot);
  const envelope = getDeclickEnvelope({
    durationSec: slice.durationSec,
    preset: options.declickPreset,
  });

  player.fadeIn = envelope.attackSec;
  player.fadeOut = envelope.releaseSec;
  player.start(undefined, slice.startSec);
  player.stop(`+${Math.max(0, slice.durationSec - envelope.releaseSec)}`);
  setTimeout(() => {
    player.dispose();
    outputNode.dispose();
  }, Math.max(250, (slice.durationSec + envelope.releaseSec) * 1000 + 100));
}

export async function stopIntelligenceSamplerPattern() {
  const Tone = await import("tone");
  activePart?.stop();
  activePart?.dispose();
  activePart = null;
  activeTracePart?.stop();
  activeTracePart?.dispose();
  activeTracePart = null;
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  clearIntelligenceSamplerPlaybackState();
}

function getPlayableSlices({
  audioBuffer,
  sampleId,
  sliceCount,
  slicesBySampleId,
}: {
  audioBuffer: AudioBuffer;
  sampleId: string;
  sliceCount?: number;
  slicesBySampleId?: Map<string, SliceRegion[]>;
}) {
  const bufferData = getAudioBufferChannelData(audioBuffer);
  const existingSlices = slicesBySampleId?.get(sampleId);
  if (existingSlices && bufferData) {
    return snapSliceRegionsToZeroCrossings({
      channelData: bufferData.channelData,
      durationSec: audioBuffer.duration,
      sampleRate: bufferData.sampleRate,
      slices: existingSlices,
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
  });
}

function createSampleOutputNode(Tone: ToneModule): ToneLimiter {
  const outputNode = new Tone.Limiter(-1);
  outputNode.connect(Tone.getDestination());
  return outputNode;
}
