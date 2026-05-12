"use client";

import {
  createPatternEngine,
  PatternEngine,
  type PatternEnginePlayOptions,
  type PatternEngineStopOptions,
} from "@/lib/audio/pattern-engine";
import { resolveSamplePlaybackSegment } from "@/lib/audio/sample-engine";
import type { SliceRegion } from "@/lib/audio/slices";
import type { DeclickPreset } from "@/lib/audio/declick";
import type { GlobalMusicContext } from "@/lib/music/context";
import type { Pattern } from "@/lib/pattern/schema";
import { resolveSample } from "@/lib/samples/resolver";

const engines = new Map<string, PatternEngine>();

export type SamplePlaybackHost = {
  toolId: string;
  playPattern: (
    pattern: Pattern,
    options?: PatternEnginePlayOptions,
  ) => Promise<void>;
  updatePattern: (
    pattern: Pattern,
    options?: PatternEnginePlayOptions,
  ) => Promise<void>;
  stopPattern: (options?: PatternEngineStopOptions) => Promise<void>;
  clearPlaybackState: (options?: { graceful?: boolean }) => void;
  isPlaying: () => boolean;
  getEngine: () => PatternEngine;
};

export function getSamplePlaybackHost(toolId: string): SamplePlaybackHost {
  let engine = engines.get(toolId);
  if (!engine) {
    engine = createPatternEngine({ id: toolId });
    engines.set(toolId, engine);
  }
  const ownedEngine = engine;
  return {
    toolId,
    playPattern: (pattern, options) => ownedEngine.play(pattern, options),
    updatePattern: (pattern, options) => ownedEngine.updatePattern(pattern, options),
    stopPattern: (options) => ownedEngine.stop(options),
    clearPlaybackState: (options) => ownedEngine.clearPlaybackState(options),
    isPlaying: () => ownedEngine.isPlaying,
    getEngine: () => ownedEngine,
  };
}

export type SampleAuditionOptions = {
  declickPreset?: DeclickPreset;
  sliceCount?: number;
  slicesBySampleId?: Map<string, SliceRegion[]>;
  musicalContext?: GlobalMusicContext;
  zeroCrossingWindowMs?: number;
};

export async function auditionSamplePlaybackSlice(
  sampleId: string,
  slot: number,
  options: SampleAuditionOptions = {},
): Promise<void> {
  const Tone = await import("tone");
  await Tone.start();
  const sample = await resolveSample(sampleId);
  const outputNode = new Tone.Limiter(-1);
  outputNode.connect(Tone.getDestination());
  const player = new Tone.Player(sample.audioBuffer).connect(outputNode);
  const segment = resolveSamplePlaybackSegment({
    audioBuffer: sample.audioBuffer,
    event: {
      durationSec: sample.audioBuffer.duration,
      gain: 1,
      playbackRate: 1,
      reverse: false,
      sampleId,
      slot,
      velocity: 1,
    },
    options,
  });

  player.fadeIn = segment.envelope.attackSec;
  player.fadeOut = segment.envelope.releaseSec;
  player.start(undefined, segment.sourceOffsetSec);
  player.stop(`+${segment.releaseStartOffsetSec}`);
  setTimeout(
    () => {
      player.dispose();
      outputNode.dispose();
    },
    Math.max(250, (segment.audibleDurationSec + segment.envelope.releaseSec) * 1000 + 100),
  );
}
