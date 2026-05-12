"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { patternToUrl } from "@/lib/pattern/url-codec";
import { useUrlPatternState } from "@/lib/pattern/use-url-pattern-state";
import { GenerationPanel } from "@/app/tools/intelligence-sampler/components/generation-panel";
import { StepGrid } from "@/app/tools/intelligence-sampler/components/step-grid";
import { TransportBar } from "@/app/tools/intelligence-sampler/components/transport-bar";
import { WaveformSlicer } from "@/app/tools/intelligence-sampler/components/waveform-slicer";
import { useIntelligenceSamplerStore } from "@/app/tools/intelligence-sampler/store";
import { getSamplePlaybackHost } from "@/lib/audio/sample-playback";
import { useGlobalBpmSync } from "@/lib/music/use-global-context-sync";

const playbackHost = getSamplePlaybackHost("intelligence-sampler");

export function IntelligenceSamplerClient() {
  const pattern = useIntelligenceSamplerStore((state) => state.pattern);
  const setPattern = useIntelligenceSamplerStore((state) => state.setPattern);
  const isPlaying = useIntelligenceSamplerStore((state) => state.isPlaying);
  const setBpm = useIntelligenceSamplerStore((state) => state.setBpm);
  useGlobalBpmSync(setBpm);

  useUrlPatternState({ pattern, setPattern, isPlaying });

  useEffect(() => {
    void playbackHost.updatePattern(pattern);
  }, [pattern]);

  useEffect(
    () => () => {
      void playbackHost.stopPattern();
    },
    [],
  );

  async function share() {
    const next = patternToUrl(new URL(window.location.href), pattern);
    await navigator.clipboard.writeText(next.toString());
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-200">
            /dashboard
          </Link>
          <h1 className="mt-1 text-lg tracking-normal text-zinc-100">intelligence-sampler</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>L1</span>
          <span className="text-zinc-200">assist</span>
          <span>{pattern.bpm} bpm</span>
          <Button onClick={() => void share()}>
            <Share2 className="size-4" />
            share
          </Button>
        </div>
      </header>
      <WaveformSlicer />
      <TransportBar />
      <StepGrid />
      <GenerationPanel />
    </main>
  );
}
