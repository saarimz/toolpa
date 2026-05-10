"use client";

import { useEffect, useState } from "react";

import {
  computeSliceWaveformBars,
  computeWaveformBars,
} from "@/app/tools/splice-lab/lib/waveform";
import type {
  SpliceLabSource,
  SpliceSourceKey,
} from "@/app/tools/splice-lab/lib/pattern";
import { resolveSample } from "@/lib/samples/resolver";

export type SpliceWaveform = {
  sourceKey: SpliceSourceKey;
  durationSec: number | null;
  fullBars: number[];
  sliceBars: number[][];
  status: "loading" | "ready" | "error";
  error?: string;
};

type SpliceWaveformEntry = readonly [SpliceSourceKey, SpliceWaveform];
type SpliceWaveformState = {
  signature: string;
  map: Map<SpliceSourceKey, SpliceWaveform>;
};

export function useSpliceWaveforms(
  sources: SpliceLabSource[],
  sliceCount: number,
) {
  const signature = createSourceSignature(sources, sliceCount);
  const [waveforms, setWaveforms] = useState<SpliceWaveformState>(() => ({
    signature,
    map: createLoadingMap(sources, sliceCount),
  }));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const entries = await Promise.all(
        sources.map(async (source): Promise<SpliceWaveformEntry> => {
          try {
            const resolved = await resolveSample(source.sampleId);
            const waveform: SpliceWaveform = {
              sourceKey: source.key,
              durationSec: resolved.audioBuffer.duration,
              fullBars: computeWaveformBars(resolved.audioBuffer, 48),
              sliceBars: computeSliceWaveformBars(resolved.audioBuffer, sliceCount, 12),
              status: "ready",
            };
            return [
              source.key,
              waveform,
            ] as const;
          } catch (unknownError) {
            const waveform: SpliceWaveform = {
              sourceKey: source.key,
              durationSec: null,
              fullBars: fallbackBars(source.key.charCodeAt(0), 48),
              sliceBars: Array.from({ length: sliceCount }, (_, slot) =>
                fallbackBars(source.key.charCodeAt(0) + slot, 12),
              ),
              status: "error",
              error:
                unknownError instanceof Error
                  ? unknownError.message
                  : "Could not decode sample",
            };
            return [
              source.key,
              waveform,
            ] as const;
          }
        }),
      );

      if (!cancelled) {
        setWaveforms({
          signature,
          map: new Map<SpliceSourceKey, SpliceWaveform>(entries),
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [signature, sliceCount, sources]);

  return waveforms.signature === signature
    ? waveforms.map
    : createLoadingMap(sources, sliceCount);
}

function createLoadingMap(sources: SpliceLabSource[], sliceCount: number) {
  return new Map(
    sources.map((source) => [
      source.key,
      {
        sourceKey: source.key,
        durationSec: null,
        fullBars: fallbackBars(source.key.charCodeAt(0), 48),
        sliceBars: Array.from({ length: sliceCount }, (_, slot) =>
          fallbackBars(source.key.charCodeAt(0) + slot, 12),
        ),
        status: "loading" as const,
      },
    ]),
  );
}

function createSourceSignature(sources: SpliceLabSource[], sliceCount: number) {
  return `${sliceCount}:${sources
    .map((source) => `${source.key}:${source.sampleId}`)
    .join("|")}`;
}

function fallbackBars(seed: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const phase = Math.sin((seed + index * 3) * 1.37);
    return 0.18 + Math.abs(phase) * 0.62;
  });
}
