"use client";

import { useEffect } from "react";
import Link from "next/link";

import { SpliceGenerationPanel } from "@/app/tools/splice-lab/components/generation-panel";
import { SpliceGrid } from "@/app/tools/splice-lab/components/splice-grid";
import { SpliceSourcePanel } from "@/app/tools/splice-lab/components/source-panel";
import { SpliceTransportBar } from "@/app/tools/splice-lab/components/transport-bar";
import { useSpliceLabStore } from "@/app/tools/splice-lab/store";
import { getSamplePlaybackHost } from "@/lib/audio/sample-playback";
import { useGlobalBpmSync } from "@/lib/music/use-global-context-sync";

const playbackHost = getSamplePlaybackHost("splice-lab");

export function SpliceLabClient() {
  const sliceCount = useSpliceLabStore((state) => state.sliceCount);
  const sources = useSpliceLabStore((state) => state.sources);
  const bpm = useSpliceLabStore((state) => state.bpm);
  const swing = useSpliceLabStore((state) => state.swing);
  const playbackRate = useSpliceLabStore((state) => state.playbackRate);
  const toPattern = useSpliceLabStore((state) => state.toPattern);
  const setBpm = useSpliceLabStore((state) => state.setBpm);
  useGlobalBpmSync(setBpm);
  useEffect(() => {
    if (!playbackHost.isPlaying()) {
      return;
    }
    const pattern = toPattern();
    void playbackHost.updatePattern({
      ...pattern,
      bpm: Math.max(40, Math.min(260, Math.round(pattern.bpm * playbackRate))),
    });
  }, [sources, sliceCount, bpm, swing, playbackRate, toPattern]);
  useEffect(
    () => () => {
      void playbackHost.stopPattern();
    },
    [],
  );
  const sourceSummary = sources
    .slice(0, 3)
    .map((source) => `${source.key}: ${source.name}`)
    .join(" / ");

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-200">
            /dashboard
          </Link>
          <h1 className="mt-1 text-lg tracking-normal text-zinc-100">splice-lab</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>L1</span>
          <span className="text-zinc-200">assist</span>
          <span>{bpm} bpm</span>
          <span>{sliceCount} slices</span>
          <span>{sources.length} sources</span>
          <span className="max-w-72 truncate">{sourceSummary}</span>
        </div>
      </header>
      <SpliceSourcePanel />
      <SpliceGrid />
      <SpliceTransportBar />
      <SpliceGenerationPanel />
    </main>
  );
}
