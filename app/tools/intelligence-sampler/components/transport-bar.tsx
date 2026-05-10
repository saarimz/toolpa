"use client";

import { useState } from "react";
import { Download, Pause, Play } from "lucide-react";

import { AudioOutputRecorder } from "@/components/audio-output-recorder";
import { PatternLiveTrace } from "@/components/pattern-live-trace";
import { Button } from "@/components/ui/button";
import { renderPatternToWav } from "@/lib/audio/wav-render";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import {
  playIntelligenceSamplerPattern,
  stopIntelligenceSamplerPattern,
} from "@/app/tools/intelligence-sampler/lib/play";
import { useIntelligenceSamplerStore } from "@/app/tools/intelligence-sampler/store";

export function TransportBar() {
  const [isRendering, setIsRendering] = useState(false);
  const pattern = useIntelligenceSamplerStore((state) => state.pattern);
  const sampleId = useIntelligenceSamplerStore((state) => state.sampleId);
  const slices = useIntelligenceSamplerStore((state) => state.slices);
  const detectedBpm = useIntelligenceSamplerStore((state) => state.detectedBpm);
  const isPlaying = useIntelligenceSamplerStore((state) => state.isPlaying);
  const musicalContext = useGlobalMusicContextStore((state) => state.context);
  const setBpm = useIntelligenceSamplerStore((state) => state.setBpm);
  const setSwing = useIntelligenceSamplerStore((state) => state.setSwing);
  const setPlaying = useIntelligenceSamplerStore((state) => state.setPlaying);

  async function togglePlayback() {
    if (isPlaying) {
      await stopIntelligenceSamplerPattern();
      setPlaying(false);
      return;
    }

    await playIntelligenceSamplerPattern(pattern, {
      musicalContext,
      slicesBySampleId: slices.length > 0 ? new Map([[sampleId, slices]]) : undefined,
    });
    setPlaying(true);
  }

  async function renderWav() {
    setIsRendering(true);

    try {
      const blob = await renderPatternToWav(pattern, {
        musicalContext,
        slicesBySampleId: slices.length > 0 ? new Map([[sampleId, slices]]) : undefined,
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${pattern.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.wav`;
      anchor.click();
      URL.revokeObjectURL(href);
    } finally {
      setIsRendering(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center gap-3 border-b border-zinc-800 p-4">
      <Button variant={isPlaying ? "danger" : "solid"} onClick={() => void togglePlayback()}>
        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        {isPlaying ? "stop" : "play"}
      </Button>
      <Button disabled={isRendering} onClick={() => void renderWav()}>
        <Download className="size-4" />
        {isRendering ? "rendering" : "render wav"}
      </Button>
      <AudioOutputRecorder filename={pattern.name} />
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
          className="w-40 accent-cyan-300"
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
    </section>
  );
}
