"use client";

import { Pause, Play } from "lucide-react";

import { FxSlotPanel } from "@/components/fx-slot-panel";
import {
  createPatternMidiPlayback,
  MidiPlaybackPanel,
} from "@/components/midi-playback-panel";
import { PatternLiveTrace } from "@/components/pattern-live-trace";
import { ToolExportPanel } from "@/components/tool-export-panel";
import { Button } from "@/components/ui/button";
import { intelligenceSamplerManifest } from "@/app/tools/intelligence-sampler/manifest";
import { getSamplePlaybackHost } from "@/lib/audio/sample-playback";
import { useToolFxPattern } from "@/lib/audio/use-fx-pattern";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { useIntelligenceSamplerStore } from "@/app/tools/intelligence-sampler/store";
import { exportPatternWavArtifact } from "@/lib/tool-exports/adapters/pattern";

const playbackHost = getSamplePlaybackHost("intelligence-sampler");

export function TransportBar() {
  const pattern = useIntelligenceSamplerStore((state) => state.pattern);
  const sampleId = useIntelligenceSamplerStore((state) => state.sampleId);
  const slices = useIntelligenceSamplerStore((state) => state.slices);
  const detectedBpm = useIntelligenceSamplerStore((state) => state.detectedBpm);
  const isPlaying = useIntelligenceSamplerStore((state) => state.isPlaying);
  const fxPattern = useToolFxPattern("intelligence-sampler");
  const musicalContext = useGlobalMusicContextStore((state) => state.context);
  const setBpm = useIntelligenceSamplerStore((state) => state.setBpm);
  const setSwing = useIntelligenceSamplerStore((state) => state.setSwing);
  const setPlaying = useIntelligenceSamplerStore((state) => state.setPlaying);
  const midiPlayback = createPatternMidiPlayback(pattern, { musicalContext });

  async function togglePlayback() {
    if (isPlaying) {
      await playbackHost.stopPattern();
      setPlaying(false);
      return;
    }

    await playbackHost.playPattern(pattern, {
      fxPattern,
      musicalContext,
      slicesBySampleId: slices.length > 0 ? new Map([[sampleId, slices]]) : undefined,
    });
    setPlaying(true);
  }

  return (
    <>
      <section className="flex flex-wrap items-center gap-3 border-b border-zinc-800 p-4">
        <Button variant={isPlaying ? "danger" : "solid"} onClick={() => void togglePlayback()}>
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          {isPlaying ? "stop" : "play"}
        </Button>
        <ToolExportPanel
          audioExport={() =>
            exportPatternWavArtifact({
              filename: `${pattern.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.wav`,
              options: {
                fxPattern,
                musicalContext,
                slicesBySampleId: slices.length > 0 ? new Map([[sampleId, slices]]) : undefined,
              },
              pattern,
              toolSlug: "intelligence-sampler",
            })
          }
          document={pattern}
          filenameStem={pattern.name}
          manifest={intelligenceSamplerManifest}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          bpm
          <input
            className="h-9 w-20 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
            type="number"
            min={40}
            max={260}
            value={pattern.bpm}
            onChange={(event) => setBpm(Number(event.target.value))}
          />
        </label>
        <label className="flex min-w-64 items-center gap-2 text-xs text-zinc-500">
          swing
          <input
            className="w-40 accent-zinc-200"
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={pattern.swing}
            onChange={(event) => setSwing(Number(event.target.value))}
          />
          <span className="w-10 text-zinc-300">{Math.round(pattern.swing * 100)}%</span>
        </label>
        <span className="text-xs text-zinc-600">
          detected {detectedBpm ? `${detectedBpm} bpm` : "pending"}
        </span>
        <PatternLiveTrace patternId={pattern.id} />
        <div className="basis-full">
          <MidiPlaybackPanel
            {...midiPlayback}
            className="border border-zinc-800 p-3"
            isPlaying={isPlaying}
          />
        </div>
      </section>
      <FxSlotPanel toolId="intelligence-sampler" />
    </>
  );
}
