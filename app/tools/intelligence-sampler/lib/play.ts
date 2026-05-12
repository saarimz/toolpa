"use client";

import {
  auditionSamplePlaybackSlice,
  getSamplePlaybackHost,
  type SampleAuditionOptions,
  type SamplePlaybackHost,
} from "@/lib/audio/sample-playback";
import type {
  PatternEnginePlayOptions,
  PatternEngineStopOptions,
} from "@/lib/audio/pattern-engine";
import { createSliceSampleId } from "@/lib/audio/slices";
import type { Pattern } from "@/lib/pattern/schema";

const host: SamplePlaybackHost = getSamplePlaybackHost("intelligence-sampler");

export type SlicedPlaybackOptions = PatternEnginePlayOptions;

export function createIntelligenceSamplerPlayerKey(sampleId: string, slot: number) {
  return createSliceSampleId(sampleId, slot);
}

export function clearIntelligenceSamplerPlaybackState(
  options: { graceful?: boolean } = {},
) {
  host.clearPlaybackState(options);
}

export function playIntelligenceSamplerPattern(
  pattern: Pattern,
  options: SlicedPlaybackOptions = {},
): Promise<void> {
  return host.playPattern(pattern, options);
}

export function stopIntelligenceSamplerPattern(
  options: PatternEngineStopOptions = {},
): Promise<void> {
  return host.stopPattern(options);
}

export function auditionIntelligenceSamplerSlice(
  sampleId: string,
  slot: number,
  options: SampleAuditionOptions = {},
): Promise<void> {
  return auditionSamplePlaybackSlice(sampleId, slot, options);
}
