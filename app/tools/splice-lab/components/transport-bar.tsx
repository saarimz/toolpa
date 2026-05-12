"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";

import { AudioOutputRecorder } from "@/components/audio-output-recorder";
import { PatternLiveTrace } from "@/components/pattern-live-trace";
import { Button } from "@/components/ui/button";
import { useSpliceLabStore } from "@/app/tools/splice-lab/store";
import { getStepDurationSec } from "@/lib/audio/pattern";
import { getSamplePlaybackHost } from "@/lib/audio/sample-playback";
import { renderPatternToWav } from "@/lib/audio/wav-render";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

const playbackHost = getSamplePlaybackHost("splice-lab");
import type { Pattern } from "@/lib/pattern/schema";

export function SpliceTransportBar() {
  const timerRef = useRef<number | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const sources = useSpliceLabStore((state) => state.sources);
  const sliceCount = useSpliceLabStore((state) => state.sliceCount);
  const bpm = useSpliceLabStore((state) => state.bpm);
  const swing = useSpliceLabStore((state) => state.swing);
  const playbackRate = useSpliceLabStore((state) => state.playbackRate);
  const isPlaying = useSpliceLabStore((state) => state.isPlaying);
  const currentStepIndex = useSpliceLabStore((state) => state.currentStepIndex);
  const musicalContext = useGlobalMusicContextStore((state) => state.context);
  const setBpm = useSpliceLabStore((state) => state.setBpm);
  const setSwing = useSpliceLabStore((state) => state.setSwing);
  const setPlaybackRate = useSpliceLabStore((state) => state.setPlaybackRate);
  const setPlaying = useSpliceLabStore((state) => state.setPlaying);
  const setCurrentStepIndex = useSpliceLabStore((state) => state.setCurrentStepIndex);
  const toPattern = useSpliceLabStore((state) => state.toPattern);
  const progressPercent =
    currentStepIndex === null ? 0 : ((currentStepIndex + 1) / sliceCount) * 100;
  const effectiveBpm = clamp(Math.round(bpm * playbackRate), 40, 260);

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
      await playbackHost.stopPattern();
      setPlaying(false);
      setCurrentStepIndex(null);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      return;
    }

    const pattern = withPlaybackRate(toPattern(), playbackRate);
    await playbackHost.playPattern(pattern, { musicalContext, sliceCount });
    setPlaying(true);
    let step = 0;
    setCurrentStepIndex(step);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
    }
    timerRef.current = window.setInterval(() => {
      step = (step + 1) % sliceCount;
      setCurrentStepIndex(step);
    }, getStepDurationSec(pattern) * 1000);
  }

  async function renderWav() {
    setIsRendering(true);
    try {
      const blob = await renderPatternToWav(withPlaybackRate(toPattern(), playbackRate), {
        musicalContext,
        sliceCount,
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "splice-lab.wav";
      anchor.click();
      URL.revokeObjectURL(href);
    } finally {
      setIsRendering(false);
    }
  }

  return (
    <section className="border-b border-zinc-800 p-4">
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(320px,1fr)_auto] lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={isPlaying ? "danger" : "solid"} onClick={() => void togglePlayback()}>
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            {isPlaying ? "stop" : "play"}
          </Button>
          <Button disabled={isRendering} onClick={() => void renderWav()}>
            <Download className="size-4" />
            {isRendering ? "rendering" : "render wav"}
          </Button>
          <AudioOutputRecorder filename="splice-lab" sourceId="splice-lab" />
        </div>
        <div className="min-w-0 border border-zinc-800 bg-black/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>
              step {currentStepIndex === null ? "-" : currentStepIndex + 1} / {sliceCount}
            </span>
            <span>
              {sources.length} source{sources.length === 1 ? "" : "s"} at {effectiveBpm} effective
              bpm
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-zinc-900">
            <div
              className="h-full bg-zinc-100 shadow-[0_0_18px_rgba(245,245,245,0.55)] transition-[width]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <PatternLiveTrace patternId={toPattern().id} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
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
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          rate
          <select
            className="h-9 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
            value={playbackRate}
            onChange={(event) => setPlaybackRate(Number(event.target.value))}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-64 items-center gap-2 text-xs text-zinc-500">
          swing
          <input
            className="w-40 accent-zinc-200"
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={swing}
            onChange={(event) => setSwing(Number(event.target.value))}
          />
          <span className="w-10 text-zinc-300">{Math.round(swing * 100)}%</span>
        </label>
      </div>
    </section>
  );
}

function withPlaybackRate(pattern: Pattern, playbackRate: number): Pattern {
  return {
    ...pattern,
    bpm: clamp(Math.round(pattern.bpm * playbackRate), 40, 260),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
