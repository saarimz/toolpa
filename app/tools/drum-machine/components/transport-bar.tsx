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
import { drumMachineManifest } from "@/app/tools/drum-machine/manifest";
import { useDrumMachineStore } from "@/app/tools/drum-machine/store";
import { getSamplePlaybackHost } from "@/lib/audio/sample-playback";
import { useToolFxPattern } from "@/lib/audio/use-fx-pattern";
import { MAX_BPM, MIN_BPM } from "@/lib/music/context";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { exportPatternWavArtifact } from "@/lib/tool-exports/adapters/pattern";

const playbackHost = getSamplePlaybackHost("drum-machine");

export function DrumTransportBar() {
  const pattern = useDrumMachineStore((state) => state.pattern);
  const isPlaying = useDrumMachineStore((state) => state.isPlaying);
  const fxPattern = useToolFxPattern("drum-machine");
  const musicalContext = useGlobalMusicContextStore((state) => state.context);
  const setPlaying = useDrumMachineStore((state) => state.setPlaying);
  const setBpm = useDrumMachineStore((state) => state.setBpm);
  const setSwing = useDrumMachineStore((state) => state.setSwing);
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
      sliceCount: 8,
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
              filename: "drum-machine.wav",
              options: { fxPattern, musicalContext, sliceCount: 8 },
              pattern,
              toolSlug: "drum-machine",
            })
          }
          document={pattern}
          filenameStem="drum-machine"
          manifest={drumMachineManifest}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          bpm
          <input
            className="h-9 w-20 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
            type="number"
            min={MIN_BPM}
            max={MAX_BPM}
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
        <PatternLiveTrace patternId={pattern.id} />
        <div className="basis-full">
          <MidiPlaybackPanel
            {...midiPlayback}
            className="border border-zinc-800 p-3"
            isPlaying={isPlaying}
          />
        </div>
      </section>
      <FxSlotPanel toolId="drum-machine" />
    </>
  );
}
