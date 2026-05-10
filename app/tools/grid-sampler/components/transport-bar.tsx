"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";

import { AudioOutputRecorder } from "@/components/audio-output-recorder";
import { PatternLiveTrace } from "@/components/pattern-live-trace";
import { Button } from "@/components/ui/button";
import { playIntelligenceSamplerPattern, stopIntelligenceSamplerPattern } from "@/app/tools/intelligence-sampler/lib/play";
import { useGridSamplerStore } from "@/app/tools/grid-sampler/store";
import { getStepDurationSec } from "@/lib/audio/pattern";
import { renderPatternToWav } from "@/lib/audio/wav-render";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

export function GridTransportBar() {
  const timerRef = useRef<number | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const sliceCount = useGridSamplerStore((state) => state.sliceCount);
  const bpm = useGridSamplerStore((state) => state.bpm);
  const swing = useGridSamplerStore((state) => state.swing);
  const isPlaying = useGridSamplerStore((state) => state.isPlaying);
  const musicalContext = useGlobalMusicContextStore((state) => state.context);
  const setBpm = useGridSamplerStore((state) => state.setBpm);
  const setSwing = useGridSamplerStore((state) => state.setSwing);
  const setPlaying = useGridSamplerStore((state) => state.setPlaying);
  const setCurrentStepIndex = useGridSamplerStore((state) => state.setCurrentStepIndex);
  const toPattern = useGridSamplerStore((state) => state.toPattern);

  useEffect(
    () => () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    },
    [],
  );

  async function togglePlayback() {
    if (isPlaying) {
      await stopIntelligenceSamplerPattern();
      setPlaying(false);
      setCurrentStepIndex(null);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      return;
    }

    const pattern = toPattern();
    await playIntelligenceSamplerPattern(pattern, { musicalContext, sliceCount });
    setPlaying(true);
    let step = 0;
    setCurrentStepIndex(step);
    timerRef.current = window.setInterval(() => {
      step = (step + 1) % sliceCount;
      setCurrentStepIndex(step);
    }, getStepDurationSec(pattern) * 1000);
  }

  async function renderWav() {
    setIsRendering(true);
    try {
      const pattern = toPattern();
      const blob = await renderPatternToWav(pattern, { musicalContext, sliceCount });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "grid-sampler.wav";
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
      <AudioOutputRecorder filename="grid-sampler" />
      <label className="flex items-center gap-2 text-xs text-zinc-500">
        bpm
        <input
          className="h-9 w-20 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
          type="number"
          min={40}
          max={260}
          value={bpm}
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
          value={swing}
          onChange={(event) => setSwing(Number(event.target.value))}
        />
        <span className="w-10 text-zinc-300">{Math.round(swing * 100)}%</span>
      </label>
      <PatternLiveTrace patternId={toPattern().id} />
    </section>
  );
}
