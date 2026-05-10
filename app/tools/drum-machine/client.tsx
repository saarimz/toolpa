"use client";

import Link from "next/link";

import { DrumGenerationPanel } from "@/app/tools/drum-machine/components/generation-panel";
import { DrumGrid } from "@/app/tools/drum-machine/components/drum-grid";
import { DrumTransportBar } from "@/app/tools/drum-machine/components/transport-bar";
import { useDrumMachineStore } from "@/app/tools/drum-machine/store";
import { useGlobalBpmSync } from "@/lib/music/use-global-context-sync";

export function DrumMachineClient() {
  const cycleLength = useDrumMachineStore((state) => state.cycleLength());
  const setBpm = useDrumMachineStore((state) => state.setBpm);
  const bpm = useDrumMachineStore((state) => state.pattern.bpm);
  useGlobalBpmSync(setBpm);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-cyan-200">
            /dashboard
          </Link>
          <h1 className="mt-1 text-lg tracking-normal text-zinc-100">drum-machine</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>L1</span>
          <span className="text-cyan-300">assist</span>
          <span>{bpm} bpm</span>
          <span>cycle {cycleLength}</span>
        </div>
      </header>
      <DrumGrid />
      <DrumTransportBar />
      <DrumGenerationPanel />
    </main>
  );
}
