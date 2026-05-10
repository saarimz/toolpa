"use client";

import Link from "next/link";

import { GridCanvas } from "@/app/tools/grid-sampler/components/grid-canvas";
import { GridGenerationPanel } from "@/app/tools/grid-sampler/components/generation-panel";
import { GridStepGrid } from "@/app/tools/grid-sampler/components/step-grid";
import { GridTransportBar } from "@/app/tools/grid-sampler/components/transport-bar";
import { useGridSamplerStore } from "@/app/tools/grid-sampler/store";
import { useGlobalBpmSync } from "@/lib/music/use-global-context-sync";

export function GridSamplerClient() {
  const sliceCount = useGridSamplerStore((state) => state.sliceCount);
  const traversal = useGridSamplerStore((state) => state.traversal);
  const bpm = useGridSamplerStore((state) => state.bpm);
  const setBpm = useGridSamplerStore((state) => state.setBpm);
  useGlobalBpmSync(setBpm);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-cyan-200">
            /dashboard
          </Link>
          <h1 className="mt-1 text-lg tracking-normal text-zinc-100">grid-sampler</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>L1</span>
          <span className="text-cyan-300">assist</span>
          <span>{bpm} bpm</span>
          <span>{sliceCount}</span>
          <span>{traversal}</span>
        </div>
      </header>
      <GridCanvas />
      <GridStepGrid />
      <GridTransportBar />
      <GridGenerationPanel />
    </main>
  );
}
