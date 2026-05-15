"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FileMusic,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  Sparkles,
} from "lucide-react";

import {
  createDefaultMidiClip,
  editMidiClipWithPrompt,
  generateMidiClipFromPrompt,
} from "@/app/tools/midi-generator/lib/agent";
import {
  createMidiClipPlayback,
} from "@/app/tools/midi-generator/lib/export";
import { midiGeneratorManifest } from "@/app/tools/midi-generator/manifest";
import {
  MIDI_CLIP_BAR_OPTIONS,
  MIDI_CLIP_GENERATION_MODE_OPTIONS,
  MIDI_CLIP_STYLE_PROFILE_OPTIONS,
  type MidiClip,
  type MidiClipBars,
  type MidiClipGenerationMode,
  type MidiClipStyleProfile,
} from "@/app/tools/midi-generator/lib/schema";
import {
  playMidiClipPreview,
  stopMidiClipPreview,
} from "@/app/tools/midi-generator/lib/tone-playback";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { MidiPlaybackPanel } from "@/components/midi-playback-panel";
import { PromptFirstSection } from "@/components/prompt-first-section";
import { ToolExportPanel } from "@/components/tool-export-panel";
import { Button } from "@/components/ui/button";
import { getScaleDefinition } from "@/lib/music/scale-catalog";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { exportMidiClipMidiArtifact } from "@/lib/tool-exports/adapters/midi-clip";
import { logClientPromptMemory } from "@/lib/prompt-memory/client";
import { usePromptParamState } from "@/lib/tools/use-prompt-param";

const TOOL_SLUG = "midi-generator";
const promptSeeds = [
  "8 bar F dorian garage bassline, swung, expressive slides and ghost notes at 138 bpm",
  "16 bar C minor cinematic chord progression with humanized lead answer",
  "64 bar A phrygian evolving arpeggio, sparse, velocity waves, 124 bpm",
];
type GenerationState = "generating" | "editing" | "resizing" | null;
const MIN_GENERATION_STATUS_MS = 240;

export function MidiGeneratorClient() {
  const [prompt, setPrompt] = usePromptParamState(promptSeeds[0] ?? "");
  const [editPrompt, setEditPrompt] = useState(
    "make it more human, add bends, and loosen the timing",
  );
  const [clip, setClip] = useState<MidiClip>(() => createDefaultMidiClip());
  const [generationMode, setGenerationMode] = useState<MidiClipGenerationMode>("auto");
  const [styleProfile, setStyleProfile] = useState<MidiClipStyleProfile>("auto");
  const [isPlaying, setIsPlaying] = useState(false);
  const [syncGlobalContext, setSyncGlobalContext] = useState(true);
  const [currentBeat, setCurrentBeat] = useState<number | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>(null);
  const globalContext = useGlobalMusicContextStore((state) => state.context);
  const hydrateGlobalContext = useGlobalMusicContextStore((state) => state.hydrate);
  const setGlobalContext = useGlobalMusicContextStore((state) => state.setContext);
  const playback = useMemo(() => createMidiClipPlayback(clip), [clip]);
  const scale = getScaleDefinition(clip.scaleId);
  const isGenerating = generationState !== null;

  useEffect(() => {
    hydrateGlobalContext();
    return () => {
      void stopMidiClipPreview();
    };
  }, [hydrateGlobalContext]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let animationFrame = 0;
    let startedAt: number | null = null;
    const totalBeats = clip.bars * clip.beatsPerBar;

    function tick(now: number) {
      startedAt ??= now;
      const elapsedSec = (now - startedAt) / 1000;
      setCurrentBeat(((elapsedSec * clip.bpm) / 60) % totalBeats);
      animationFrame = window.requestAnimationFrame(tick);
    }

    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [clip.bars, clip.beatsPerBar, clip.bpm, isPlaying]);

  async function togglePlayback() {
    if (isPlaying) {
      await stopMidiClipPreview();
      setIsPlaying(false);
      return;
    }

    await playMidiClipPreview(clip);
    setIsPlaying(true);
  }

  async function generateClip(nextPrompt = prompt) {
    await withGenerationState("generating", async () => {
      logClientPromptMemory({
        action: "generate-midi",
        metadata: {
          generationMode,
          styleProfile,
        },
        source: "client.midi-generator",
        toolSlug: TOOL_SLUG,
        userPrompt: nextPrompt,
      });
      const nextClip = generateMidiClipFromPrompt({
        generationMode,
        musicalContext: globalContext,
        prompt: nextPrompt,
        previousClip: clip,
        styleProfile,
      });
      applyClip(nextClip);
      if (isPlaying) {
        await playMidiClipPreview(nextClip);
      }
    });
  }

  async function editClip() {
    await withGenerationState("editing", async () => {
      logClientPromptMemory({
        action: "edit-midi",
        metadata: {
          clipId: clip.id,
          generationMode,
          styleProfile,
        },
        source: "client.midi-generator",
        toolSlug: TOOL_SLUG,
        userPrompt: editPrompt,
      });
      const nextClip = editMidiClipWithPrompt(clip, editPrompt, globalContext);
      applyClip(nextClip);
      if (isPlaying) {
        await playMidiClipPreview(nextClip);
      }
    });
  }

  async function chooseBars(bars: MidiClipBars) {
    await withGenerationState("resizing", async () => {
      const nextPrompt = `${prompt} ${bars} bars`;
      logClientPromptMemory({
        action: "resize-midi",
        metadata: {
          bars,
          generationMode,
          styleProfile,
        },
        source: "client.midi-generator",
        toolSlug: TOOL_SLUG,
        userPrompt: nextPrompt,
      });
      const nextClip = generateMidiClipFromPrompt({
        generationMode,
        musicalContext: globalContext,
        prompt: nextPrompt,
        previousClip: clip,
        styleProfile,
      });
      applyClip(nextClip);
      if (isPlaying) {
        await playMidiClipPreview(nextClip);
      }
    });
  }

  function applyClip(nextClip: MidiClip) {
    setClip(nextClip);
    if (syncGlobalContext) {
      setGlobalContext({
        bpm: nextClip.bpm,
        key: {
          referenceFrequency: globalContext.key.referenceFrequency,
          scaleId: nextClip.scaleId,
          tonic: nextClip.key,
        },
        swing: nextClip.swing,
      });
    }
  }

  async function withGenerationState(
    nextState: Exclude<GenerationState, null>,
    operation: () => Promise<void> | void,
  ) {
    if (generationState) {
      return;
    }

    setGenerationState(nextState);
    await waitForLoadingPaint();

    try {
      await operation();
      await delay(MIN_GENERATION_STATUS_MS);
    } finally {
      setGenerationState(null);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-200">
            /dashboard
          </Link>
          <h1 className="mt-1 text-lg tracking-normal text-zinc-100">
            MIDI Generator
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>L1</span>
          <span className="text-zinc-200">midi instrument</span>
          <span>{clip.key} {scale.name}</span>
          <span>{clip.bpm} bpm</span>
          <span>{clip.bars} bars</span>
          <span>{clip.metadata.generationMode}</span>
        </div>
      </header>

      <PromptFirstSection className="grid lg:grid-cols-[minmax(0,1fr)_390px]">
        <div
          aria-busy={isGenerating}
          className="relative border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r"
        >
          {isGenerating ? (
            <LlmGeneratingOverlay
              detail={getGenerationDetail(generationState)}
              label={getGenerationLabel(generationState)}
            />
          ) : null}
          <div className="mb-3 flex flex-wrap gap-2">
            {promptSeeds.map((seed) => (
              <button
                className="rounded-sm border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                disabled={isGenerating}
                key={seed}
                onClick={() => setPrompt(seed)}
                type="button"
              >
                {seed}
              </button>
            ))}
          </div>

          <label className="block text-xs text-zinc-500">
            generation prompt
            <textarea
              className="mt-2 h-28 w-full resize-none rounded-sm border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-100 outline-none focus:border-zinc-200"
              disabled={isGenerating}
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
            />
          </label>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              part focus
              <select
                aria-label="part focus"
                className="mt-2 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none focus:border-zinc-200"
                disabled={isGenerating}
                value={generationMode}
                onChange={(event) =>
                  setGenerationMode(event.currentTarget.value as MidiClipGenerationMode)
                }
              >
                {MIDI_CLIP_GENERATION_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-zinc-500">
              style profile
              <select
                aria-label="style profile"
                className="mt-2 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none focus:border-zinc-200"
                disabled={isGenerating}
                value={styleProfile}
                onChange={(event) =>
                  setStyleProfile(event.currentTarget.value as MidiClipStyleProfile)
                }
              >
                {MIDI_CLIP_STYLE_PROFILE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={isGenerating} onClick={() => void generateClip()}>
              {generationState === "generating" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {generationState === "generating" ? "generating" : "generate midi"}
            </Button>
          </div>

          <label className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
            <input
              checked={syncGlobalContext}
              className="accent-zinc-100"
              onChange={(event) => setSyncGlobalContext(event.currentTarget.checked)}
              type="checkbox"
            />
            update global context from generated BPM, key, scale, and swing
          </label>

          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
              <FileMusic className="size-4 text-zinc-200" />
              clip length
            </div>
            <div className="flex flex-wrap gap-2">
              {MIDI_CLIP_BAR_OPTIONS.map((bars) => (
                <button
                  className={
                    bars === clip.bars
                      ? "rounded-sm border border-zinc-100 bg-zinc-100 px-2 py-1 text-xs text-zinc-950"
                      : "rounded-sm border border-zinc-800 px-2 py-1 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-100"
                  }
                  disabled={isGenerating}
                  key={bars}
                  onClick={() => void chooseBars(bars)}
                  type="button"
                >
                  {bars}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-5 block text-xs text-zinc-500">
            follow-up edit prompt
            <textarea
              className="mt-2 h-20 w-full resize-none rounded-sm border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-100 outline-none focus:border-zinc-200"
              disabled={isGenerating}
              value={editPrompt}
              onChange={(event) => setEditPrompt(event.currentTarget.value)}
            />
          </label>
          <div className="mt-3">
            <Button disabled={isGenerating} onClick={() => void editClip()}>
              {generationState === "editing" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              {generationState === "editing" ? "editing" : "edit midi"}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
            <Button onClick={() => void togglePlayback()} variant={isPlaying ? "danger" : "solid"}>
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              {isPlaying ? "stop" : "preview"}
            </Button>
            <ToolExportPanel
              document={clip}
              filenameStem={clip.name}
              manifest={midiGeneratorManifest}
              midiExport={() => exportMidiClipMidiArtifact({ clip, toolSlug: TOOL_SLUG })}
            />
          </div>
        </div>

        <aside className="p-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Metric label="document" value="midi-clip" />
            <Metric label="notes" value={String(clip.notes.length)} />
            <Metric label="key" value={`${clip.key} ${scale.name}`} />
            <Metric label="tempo" value={`${clip.bpm} bpm`} />
            <Metric label="meter" value={`${clip.beatsPerBar}/4`} />
            <Metric label="focus" value={clip.metadata.generationMode} />
            <Metric label="style" value={clip.metadata.styleProfile} />
            <Metric label="swing" value={`${Math.round(clip.swing * 100)}%`} />
            <Metric label="history" value={String(clip.metadata.history.length)} />
          </div>

          <div className="mt-4 border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
              tracks
            </div>
            <div className="grid gap-2">
              {clip.tracks.map((track) => (
                <div
                  className="flex items-center justify-between gap-2 border border-zinc-900 px-2 py-1 text-xs"
                  key={track.id}
                >
                  <span className="text-zinc-200">{track.name}</span>
                  <span className="text-zinc-600">
                    ch {track.channel + 1} / {track.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-400">
            {clip.metadata.rationale}
          </div>
        </aside>
      </PromptFirstSection>

      <MidiPlaybackPanel
        {...playback}
        currentBeat={isPlaying ? currentBeat : null}
        isPlaying={isPlaying}
      />
    </main>
  );
}

function getGenerationLabel(state: GenerationState) {
  if (state === "editing") {
    return "editing midi clip";
  }
  if (state === "resizing") {
    return "regenerating midi length";
  }
  return "generating midi clip";
}

function getGenerationDetail(state: GenerationState) {
  if (state === "editing") {
    return "Applying the follow-up prompt to timing, notes, bends, and velocity.";
  }
  if (state === "resizing") {
    return "Rebuilding the clip at the selected bar length with the current prompt.";
  }
  return "Creating an expressive MIDI document from the prompt and global context.";
}

async function waitForLoadingPaint() {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function delay(ms: number) {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</div>
      <div className="mt-1 truncate text-sm text-zinc-200">{value}</div>
    </div>
  );
}
