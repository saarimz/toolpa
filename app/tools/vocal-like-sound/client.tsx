"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Sparkles, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FxSlotPanel } from "@/components/fx-slot-panel";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { createSynthSceneMidiPlayback, MidiPlaybackPanel } from "@/components/midi-playback-panel";
import { PromptFirstSection } from "@/components/prompt-first-section";
import { ToolExportPanel } from "@/components/tool-export-panel";
import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import { fetchSynthSceneFromGateway } from "@/app/tools/evolving-fm-synth/lib/gateway-request";
import { createSynthSceneFromMidiFile } from "@/app/tools/evolving-fm-synth/lib/midi-import";
import { getScaleDisplayName, SynthSceneSchema, type SynthScale, type SynthScene } from "@/app/tools/evolving-fm-synth/lib/schema";
import { playEvolvingFmSynthScene, stopEvolvingFmSynthScene } from "@/app/tools/evolving-fm-synth/lib/tone-playback";
import { vocalLikeSoundManifest } from "@/app/tools/vocal-like-sound/manifest";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { usePromptParamState } from "@/lib/tools/use-prompt-param";
import { useToolFxPattern } from "@/lib/audio/use-fx-pattern";
import { exportSynthSceneMidiArtifact, exportSynthSceneWavArtifact } from "@/lib/tool-exports/adapters/synth-scene";

const TOOL_SLUG = "vocal-like-sound";
const TOOL_NAME = "Vocal Like Sound";
const TOOL_DESCRIPTION = "a tool that takes a vocal like sound and stutters it with probabilistic repeats";
const KEY_OPTIONS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const SCALE_OPTIONS: SynthScale[] = ["minor", "dorian", "phrygian", "minor-pentatonic", "chromatic"];

export function VocalLikeSoundClient() {
  const [prompt, setPrompt] = usePromptParamState(TOOL_DESCRIPTION);
  const [scene, setScene] = useState<SynthScene>(() => createDefaultSynthScene(TOOL_DESCRIPTION));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [agentStatus, setAgentStatus] = useState("local patch ready");
  const [error, setError] = useState<string | null>(null);
  const musicalContext = useGlobalMusicContextStore((state) => state.context);
  const hydrateGlobalContext = useGlobalMusicContextStore((state) => state.hydrate);
  const fxPattern = useToolFxPattern(TOOL_SLUG);
  const sceneRef = useRef(scene);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    hydrateGlobalContext();
    return () => {
      void stopEvolvingFmSynthScene();
    };
  }, [hydrateGlobalContext]);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlayingRef.current) {
      return;
    }

    void playEvolvingFmSynthScene(sceneRef.current, { fxPattern });
  }, [fxPattern]);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      setScene((current) =>
        SynthSceneSchema.parse({
          ...current,
          bpm: musicalContext.bpm,
          swing: musicalContext.swing,
          key: musicalContext.key.tonic,
          scale: musicalContext.key.scaleId,
        }),
      );
    }, 0);
    return () => window.clearTimeout(syncTimer);
  }, [musicalContext]);

  async function togglePlayback() {
    if (isPlaying) {
      await stopEvolvingFmSynthScene();
      setIsPlaying(false);
      return;
    }

    await playEvolvingFmSynthScene(scene, { fxPattern });
    setIsPlaying(true);
  }

  function updateScene(patch: Partial<SynthScene>) {
    setScene((current) => SynthSceneSchema.parse({ ...current, ...patch }));
  }

  async function generateScene() {
    setIsGenerating(true);
    setError(null);
    setAgentStatus("gateway pending");
    try {
      const result = await fetchSynthSceneFromGateway({
        mode: "generate",
        musicalContext,
        prompt,
        scene,
      });
      setScene(result.scene);
      setAgentStatus(result.warning ?? `${result.source} scene ready`);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Synth generation failed";
      setError(message);
      setAgentStatus("local patch kept");
    } finally {
      setIsGenerating(false);
    }
  }

  async function importMidiFile(file: File | null) {
    if (!file) {
      return;
    }
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const nextScene = createSynthSceneFromMidiFile(bytes, sceneRef.current);
      setScene(nextScene);
      setAgentStatus("midi import");
      if (isPlayingRef.current) {
        await stopEvolvingFmSynthScene();
        await playEvolvingFmSynthScene(nextScene, { fxPattern });
      }
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "MIDI import failed");
      setAgentStatus("midi import failed");
    }
  }

  const midiPlayback = createSynthSceneMidiPlayback(scene);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto flex max-w-7xl flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
          <div>
            <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-200">
              /dashboard
            </Link>
            <h1 className="mt-1 text-lg text-zinc-100">{TOOL_NAME}</h1>
            <p className="mt-1 max-w-3xl text-xs text-zinc-500">{TOOL_DESCRIPTION}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>L1</span>
            <span className="text-zinc-200">generated synth</span>
            <span>{scene.key} {getScaleDisplayName(scene.scale)}</span>
            <span>{scene.bpm} bpm</span>
          </div>
        </header>

        <PromptFirstSection className="relative grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          {isGenerating ? (
            <LlmGeneratingOverlay
              detail="Prompting the LLM for a generated SynthScene."
              label="generating synth scene"
              tone="solid"
            />
          ) : null}
          <section className="p-4">
            <label className="block text-xs text-zinc-500">
              scene prompt
              <textarea
                className="mt-2 h-28 w-full resize-none rounded-sm border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-100 outline-none focus:border-zinc-200"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant={isPlaying ? "danger" : "solid"} onClick={() => void togglePlayback()}>
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                {isPlaying ? "stop" : "play"}
              </Button>
              <Button disabled={isGenerating} onClick={() => void generateScene()}>
                {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                generate
              </Button>
              <ToolExportPanel
                audioExport={() =>
                  exportSynthSceneWavArtifact({
                    filename: `${scene.name}.wav`,
                    fxPattern,
                    scene,
                    toolSlug: TOOL_SLUG,
                  })
                }
                document={scene}
                filenameStem={scene.name}
                manifest={vocalLikeSoundManifest}
                midiExport={() =>
                  exportSynthSceneMidiArtifact({
                    scene,
                    toolSlug: TOOL_SLUG,
                  })
                }
              />
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-zinc-700 bg-zinc-950 px-3 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900">
                <Upload className="size-4" />
                upload midi
                <input
                  className="sr-only"
                  type="file"
                  accept=".mid,.midi,audio/midi"
                  onChange={(event) => void importMidiFile(event.currentTarget.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="mt-3 text-xs text-zinc-500">agent {agentStatus}</div>
            {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
          </section>

          <aside className="border-t border-zinc-800 p-4 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-zinc-500">
                key
                <select
                  className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                  value={scene.key}
                  onChange={(event) => updateScene({ key: event.target.value })}
                >
                  {KEY_OPTIONS.map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-zinc-500">
                scale
                <select
                  className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                  value={scene.scale}
                  onChange={(event) => updateScene({ scale: event.target.value })}
                >
                  {[...new Set([...SCALE_OPTIONS, scene.scale])].map((scale) => (
                    <option key={scale} value={scale}>{getScaleDisplayName(scale)}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-xs text-zinc-500">
              bpm
              <input
                className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                type="number"
                min={1}
                max={260}
                value={scene.bpm}
                onChange={(event) => updateScene({ bpm: Number(event.target.value) })}
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-500">
              swing
              <input
                className="mt-1 w-full accent-zinc-200"
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={scene.swing}
                onChange={(event) => updateScene({ swing: Number(event.target.value) })}
              />
            </label>
          </aside>
        </PromptFirstSection>

        <MidiPlaybackPanel {...midiPlayback} isPlaying={isPlaying} />
        <FxSlotPanel toolId={TOOL_SLUG} />

        <section className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {scene.voices.map((voice) => (
            <div className="border border-zinc-800 bg-black/20 p-3 text-xs" key={voice.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-zinc-100">{voice.label}</div>
                <span className="rounded-sm border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">{voice.role}</span>
              </div>
              <div className="mt-2 text-zinc-600">
                {voice.steps.filter((step) => step.active).length} active steps / gain {voice.gainDb} dB
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-3 p-4 lg:grid-cols-2">
          <pre className="max-h-72 overflow-auto border border-zinc-800 bg-black p-3 text-[11px] leading-5 text-zinc-500">
            {scene.metadata.rationale || "SynthScene rationale will appear here"}
          </pre>
          <pre className="max-h-72 overflow-auto border border-zinc-800 bg-black p-3 text-[11px] leading-5 text-zinc-500">
            {JSON.stringify(scene.metadata.agentPlan, null, 2)}
          </pre>
        </section>
      </section>
    </main>
  );
}
