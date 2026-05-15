"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  Pause,
  Play,
  RefreshCcw,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Waves,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FxSlotPanel } from "@/components/fx-slot-panel";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { PromptFirstSection } from "@/components/prompt-first-section";
import { ToolExportPanel } from "@/components/tool-export-panel";
import {
  createSynthSceneMidiPlayback,
  MidiPlaybackPanel,
} from "@/components/midi-playback-panel";
import { getSynthStepDurationSec } from "@/app/tools/evolving-fm-synth/lib/events";
import {
  buildEvolvingFmSynthPrompt,
  buildEvolvingFmSynthSystemPrompt,
} from "@/app/tools/evolving-fm-synth/lib/agent";
import {
  playEvolvingFmSynthScene,
  stopEvolvingFmSynthScene,
} from "@/app/tools/evolving-fm-synth/lib/tone-playback";
import {
  fetchSynthSceneFromGateway,
  SynthGatewayTimeoutError,
} from "@/app/tools/evolving-fm-synth/lib/gateway-request";
import { createSynthSceneFromMidiFile } from "@/app/tools/evolving-fm-synth/lib/midi-import";
import { evolvingFmSynthManifest } from "@/app/tools/evolving-fm-synth/manifest";
import {
  midiToNoteName,
  getScaleDisplayName,
  type EvolutionBars,
  type SynthEffects,
  type SynthMacros,
  type SynthRootWaveform,
  type SynthScale,
  type SynthScene,
  type SynthStep,
  type SynthVoice,
  type VoicePatch,
} from "@/app/tools/evolving-fm-synth/lib/schema";
import { useEvolvingFmSynthStore } from "@/app/tools/evolving-fm-synth/store";
import { MAX_BPM, MIN_BPM } from "@/lib/music/context";
import { useGlobalSynthContextSync } from "@/lib/music/use-global-context-sync";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { logClientPromptMemory } from "@/lib/prompt-memory/client";
import {
  exportSynthSceneMidiArtifact,
  exportSynthSceneWavArtifact,
} from "@/lib/tool-exports/adapters/synth-scene";
import { useHydratePromptParam } from "@/lib/tools/use-prompt-param";
import { useToolFxPattern } from "@/lib/audio/use-fx-pattern";

const TOOL_SLUG = "evolving-fm-synth";
const promptSeeds = [
  "dub techno in F minor at 124 bpm over 32 bars, soft evolving pads, ancient tape drift",
  "C dorian 118 bpm, 64 bars, sparse sub pulse, evolving glassy tones",
  "A phrygian, 128 bars, ritual FM drone, very slow filter motion, C2 E2 G2",
];

const keyOptions = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const evolutionBarOptions: EvolutionBars[] = [4, 8, 16, 32, 64, 128];
const scaleOptions: SynthScale[] = [
  "minor",
  "dorian",
  "phrygian",
  "minor-pentatonic",
  "chromatic",
];
const rootWaveformOptions: Array<{
  label: string;
  value: SynthRootWaveform;
}> = [
  { label: "sine", value: "sine" },
  { label: "wavetable", value: "wavetable" },
  { label: "square", value: "square" },
  { label: "saw", value: "sawtooth" },
];

const macroControls: Array<{
  advanced?: boolean;
  key: keyof SynthMacros;
  label: string;
}> = [
  { key: "evolution", label: "motion" },
  { key: "brightness", label: "tone" },
  { key: "dubSpace", label: "space" },
  { key: "density", label: "density" },
  { advanced: true, key: "mutationDepth", label: "mutation" },
  { advanced: true, key: "analogDrift", label: "drift" },
];

export function EvolvingFmSynthClient() {
  const tickRef = useRef<number | null>(null);
  const gatewayRequestIdRef = useRef(0);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [agentSource, setAgentSource] = useState("local-agent");
  const [agentError, setAgentError] = useState<string | null>(null);
  const prompt = useEvolvingFmSynthStore((state) => state.prompt);
  const scene = useEvolvingFmSynthStore((state) => state.scene);
  const isPlaying = useEvolvingFmSynthStore((state) => state.isPlaying);
  const currentStepIndex = useEvolvingFmSynthStore((state) => state.currentStepIndex);
  const selectedVoiceId = useEvolvingFmSynthStore((state) => state.selectedVoiceId);
  const selectedStepIndex = useEvolvingFmSynthStore((state) => state.selectedStepIndex);
  const setPrompt = useEvolvingFmSynthStore((state) => state.setPrompt);
  const generate = useEvolvingFmSynthStore((state) => state.generate);
  const evolve = useEvolvingFmSynthStore((state) => state.evolve);
  const setScene = useEvolvingFmSynthStore((state) => state.setScene);
  const setPlaying = useEvolvingFmSynthStore((state) => state.setPlaying);
  const setCurrentStepIndex = useEvolvingFmSynthStore(
    (state) => state.setCurrentStepIndex,
  );
  const setSelectedVoiceId = useEvolvingFmSynthStore(
    (state) => state.setSelectedVoiceId,
  );
  const setSelectedStepIndex = useEvolvingFmSynthStore(
    (state) => state.setSelectedStepIndex,
  );
  const setMacro = useEvolvingFmSynthStore((state) => state.setMacro);
  const setBpm = useEvolvingFmSynthStore((state) => state.setBpm);
  const setEvolutionBars = useEvolvingFmSynthStore(
    (state) => state.setEvolutionBars,
  );
  const setKeyAndScale = useEvolvingFmSynthStore((state) => state.setKeyAndScale);
  const toggleStep = useEvolvingFmSynthStore((state) => state.toggleStep);
  const updateStep = useEvolvingFmSynthStore((state) => state.updateStep);
  const updateVoicePatch = useEvolvingFmSynthStore((state) => state.updateVoicePatch);
  const updateEffects = useEvolvingFmSynthStore((state) => state.updateEffects);
  const globalMusicContext = useGlobalMusicContextStore((state) => state.context);
  const fxPattern = useToolFxPattern(TOOL_SLUG);
  const sceneRef = useRef(scene);
  const fxPatternRef = useRef(fxPattern);
  const appliedFxPatternRef = useRef(fxPattern);
  const restartTransportRef = useRef<
    (nextScene: SynthScene, nextFxPattern: typeof fxPattern) => Promise<void>
  >(async () => undefined);
  useGlobalSynthContextSync({ setBpm, setKeyAndScale });
  useHydratePromptParam(setPrompt);

  const selectedVoice = scene.voices.find((voice) => voice.id === selectedVoiceId) ?? scene.voices[0];
  const selectedStep =
    selectedVoice && selectedStepIndex !== null
      ? selectedVoice.steps.find((step) => step.step === selectedStepIndex) ?? null
      : null;
  const agentPrompt = useMemo(
    () => buildEvolvingFmSynthPrompt({ musicalContext: globalMusicContext, prompt, scene }),
    [globalMusicContext, prompt, scene],
  );
  const agentStatus = getAgentStatus({
    isGenerating: isAiGenerating,
    source: agentSource,
    warning: agentError,
  });
  const midiPlayback = useMemo(() => createSynthSceneMidiPlayback(scene), [scene]);
  const currentBeat =
    currentStepIndex === null ? null : (currentStepIndex * 4) / scene.stepsPerBar;
  const localScaleOptions = useMemo(
    () =>
      scaleOptions.includes(scene.scale)
        ? scaleOptions
        : [...scaleOptions, scene.scale],
    [scene.scale],
  );

  useEffect(
    () => () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
      }
      void stopEvolvingFmSynthScene();
      setPlaying(false);
      setCurrentStepIndex(null);
    },
    [setCurrentStepIndex, setPlaying],
  );

  useEffect(() => {
    restartTransportRef.current = restartTransport;
  });

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    fxPatternRef.current = fxPattern;
  }, [fxPattern]);

  useEffect(() => {
    if (!isPlaying || appliedFxPatternRef.current === fxPattern) {
      return;
    }

    void restartTransportRef.current(sceneRef.current, fxPattern);
  }, [fxPattern, isPlaying]);

  async function togglePlayback() {
    if (isPlaying) {
      await stopTransport();
      return;
    }

    await restartTransport(scene);
  }

  async function restartTransport(nextScene: SynthScene, nextFxPattern = fxPatternRef.current) {
    appliedFxPatternRef.current = nextFxPattern;
    await playEvolvingFmSynthScene(nextScene, { fxPattern: nextFxPattern });
    setPlaying(true);
    startStepTicker(nextScene);
  }

  async function stopTransport() {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    await stopEvolvingFmSynthScene();
    setPlaying(false);
    setCurrentStepIndex(null);
  }

  function startStepTicker(nextScene: SynthScene) {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
    }

    const totalSteps = nextScene.bars * nextScene.stepsPerBar;
    const stepMs = getSynthStepDurationSec(nextScene) * 1000;
    let step = 0;
    setCurrentStepIndex(step);
    tickRef.current = window.setInterval(() => {
      step = (step + 1) % totalSteps;
      setCurrentStepIndex(step);
    }, stepMs);
  }

  async function generateScene() {
    logClientPromptMemory({
      action: "local-generate-synth-scene",
      metadata: {
        sceneId: sceneRef.current.id,
      },
      source: "client.evolving-fm-synth",
      toolSlug: TOOL_SLUG,
      userPrompt: prompt,
    });
    generate(globalMusicContext);
    setAgentSource("local-agent");
    setAgentError(null);
    if (isPlaying) {
      await restartTransport(useEvolvingFmSynthStore.getState().scene);
    }
    void requestGatewayScene("generate", isPlaying);
  }

  async function evolveScene() {
    logClientPromptMemory({
      action: "local-evolve-synth-scene",
      metadata: {
        sceneId: sceneRef.current.id,
      },
      source: "client.evolving-fm-synth",
      toolSlug: TOOL_SLUG,
      userPrompt: prompt,
    });
    evolve(globalMusicContext);
    setAgentSource("local-agent");
    setAgentError(null);
    if (isPlaying) {
      await restartTransport(useEvolvingFmSynthStore.getState().scene);
    }
    void requestGatewayScene("evolve", isPlaying);
  }

  async function importMidiFile(file: File | null) {
    if (!file) {
      return;
    }

    setAgentError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const nextScene = createSynthSceneFromMidiFile(bytes, sceneRef.current);
      setScene(nextScene);
      setAgentSource("midi import");
      if (isPlaying) {
        await restartTransport(nextScene);
      }
    } catch (error) {
      setAgentSource("local-agent");
      setAgentError(error instanceof Error ? error.message : "Could not import MIDI");
    }
  }

  async function requestGatewayScene(
    mode: "generate" | "evolve",
    restartWhenReady: boolean,
  ) {
    const requestId = gatewayRequestIdRef.current + 1;
    gatewayRequestIdRef.current = requestId;
    setIsAiGenerating(true);
    try {
      const current = useEvolvingFmSynthStore.getState().scene;
      const result = await fetchSynthSceneFromGateway({
        mode,
        musicalContext: globalMusicContext,
        prompt,
        scene: current,
      });
      if (gatewayRequestIdRef.current !== requestId) {
        return;
      }

      useEvolvingFmSynthStore.getState().setScene(result.scene);
      setAgentSource(result.source);
      setAgentError(result.warning);
      if (restartWhenReady) {
        await restartTransport(result.scene);
      }
    } catch (error) {
      if (gatewayRequestIdRef.current !== requestId) {
        return;
      }

      setAgentSource("local-agent");
      setAgentError(
        error instanceof SynthGatewayTimeoutError
          ? error.message
          : error instanceof Error
            ? error.message
            : "AI generation failed",
      );
    } finally {
      if (gatewayRequestIdRef.current === requestId) {
        setIsAiGenerating(false);
      }
    }
  }

  function patchEffects(patch: Partial<SynthEffects>) {
    updateEffects(patch);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-200">
            /dashboard
          </Link>
          <h1 className="mt-1 text-lg tracking-normal text-zinc-100">
            evolving-fm-synth
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>L1</span>
          <span className="text-zinc-200">agentic</span>
          <span>{scene.key} {getScaleDisplayName(scene.scale)}</span>
          <span>{scene.bpm} bpm</span>
        </div>
      </header>

      <PromptFirstSection className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative overflow-hidden border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r">
          {isAiGenerating ? (
            <LlmGeneratingOverlay
              detail="Prompting the LLM for an evolving FM synth scene."
              label="generating synth prompt"
              tone="solid"
            />
          ) : null}

          <div className="mb-3 flex flex-wrap gap-2">
            {promptSeeds.map((seed) => (
              <button
                key={seed}
                type="button"
                className="rounded-sm border border-zinc-800 px-3 py-2 text-left text-xs text-zinc-400 hover:border-zinc-200 hover:text-zinc-100"
                onClick={() => setPrompt(seed)}
              >
                {seed}
              </button>
            ))}
          </div>
          <label className="block text-xs text-zinc-500">
            synth prompt
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
            <Button disabled={isAiGenerating} onClick={() => void generateScene()}>
              <Sparkles className="size-4" />
              generate
            </Button>
            <Button disabled={isAiGenerating} onClick={() => void evolveScene()}>
              <RefreshCcw className="size-4" />
              evolve
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
              manifest={evolvingFmSynthManifest}
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
            <label className="inline-flex h-9 items-center gap-2 rounded-sm border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-300">
              cycle {scene.bars} bars
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>agent {agentStatus.source}</span>
            {agentStatus.warning ? (
              <span className="text-amber-200">{agentStatus.warning}</span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-zinc-500">
              key
              <select
                className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                value={scene.key}
                onChange={(event) => setKeyAndScale(event.target.value)}
              >
                {keyOptions.map((key) => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              scale
              <select
                className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                value={scene.scale}
                onChange={(event) =>
                  setKeyAndScale(scene.key, event.target.value as SynthScale)
                }
              >
                {localScaleOptions.map((scale) => (
                  <option key={scale} value={scale}>{getScaleDisplayName(scale)}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs text-zinc-500">
            bpm
            <input
              className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
              type="number"
              min={MIN_BPM}
              max={MAX_BPM}
              value={scene.bpm}
              onChange={(event) => setBpm(Number(event.target.value))}
            />
          </label>
          <label className="text-xs text-zinc-500">
            evolution length
            <select
              className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
              value={scene.bars}
              onChange={(event) =>
                setEvolutionBars(Number(event.target.value) as EvolutionBars)
              }
            >
              {evolutionBarOptions.map((bars) => (
                <option key={bars} value={bars}>
                  {bars} bars
                </option>
              ))}
            </select>
          </label>
          <MacroPanel macros={scene.macros} setMacro={setMacro} />
        </div>
      </PromptFirstSection>

      <SynthPerformancePanel
        currentStepIndex={currentStepIndex}
        isPlaying={isPlaying}
        scene={scene}
      />

      <details className="border-b border-zinc-800">
        <summary className="cursor-pointer px-4 py-3 text-xs text-zinc-400 hover:text-zinc-100">
          MIDI editor - {midiPlayback.notes.length} notes - {scene.bars} bars
        </summary>
        <MidiPlaybackPanel
          {...midiPlayback}
          className="border-t border-zinc-800"
          currentBeat={currentBeat}
          isPlaying={isPlaying}
        />
        <Sequencer
          scene={scene}
          currentStepIndex={currentStepIndex}
          selectedVoiceId={selectedVoiceId}
          selectedStepIndex={selectedStepIndex}
          setSelectedVoiceId={setSelectedVoiceId}
          setSelectedStepIndex={setSelectedStepIndex}
          toggleStep={toggleStep}
        />
      </details>

      <details className="border-b border-zinc-800">
        <summary className="cursor-pointer px-4 py-3 text-xs text-zinc-400 hover:text-zinc-100">
          sound editor - {selectedVoice?.label ?? "voice"} - effects
        </summary>
        <section className="grid border-t border-zinc-800 lg:grid-cols-[minmax(0,1fr)_420px]">
          <PatchPanel
            selectedVoice={selectedVoice}
            selectedStep={selectedStep}
            updateStep={updateStep}
            updateVoicePatch={updateVoicePatch}
          />
          <div className="border-t border-zinc-800 lg:border-l lg:border-t-0">
            <EffectsPanel scene={scene} patchEffects={patchEffects} />
            <FxSlotPanel toolId={TOOL_SLUG} />
          </div>
        </section>
      </details>

      <details className="border-b border-zinc-800">
        <summary className="cursor-pointer px-4 py-3 text-xs text-zinc-500 hover:text-zinc-200">
          agent detail - prompt contract
        </summary>
        <section className="grid gap-4 border-t border-zinc-800 p-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
              <BrainCircuit className="size-4 text-zinc-200" />
              agent trace
            </div>
            <pre className="max-h-56 overflow-auto text-[11px] leading-5 text-zinc-500">
              {[
                scene.metadata.rationale,
                "",
                ...scene.metadata.agentPlan.map((item, index) => `${index + 1}. ${item}`),
                "",
                ...scene.metadata.researchBasis,
              ].join("\n")}
            </pre>
          </div>
          <div className="border border-zinc-800 bg-black p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
              <Zap className="size-4 text-zinc-200" />
              prompt contract
            </div>
            <pre className="max-h-56 overflow-auto text-[11px] leading-5 text-zinc-100">
              {[buildEvolvingFmSynthSystemPrompt(), "", agentPrompt].join("\n")}
            </pre>
          </div>
        </section>
      </details>
    </main>
  );
}

function MacroPanel({
  macros,
  setMacro,
}: {
  macros: SynthMacros;
  setMacro: (macro: keyof SynthMacros, value: number) => void;
}) {
  const primaryControls = macroControls.filter((control) => !control.advanced);
  const advancedControls = macroControls.filter((control) => control.advanced);

  return (
    <div className="grid gap-2">
      {primaryControls.map((control) => (
        <SliderRow
          key={control.key}
          label={control.label}
          max={1}
          min={0}
          step={0.01}
          value={macros[control.key]}
          onChange={(value) => setMacro(control.key, value)}
        />
      ))}
      <details>
        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-200">
          deeper motion
        </summary>
        <div className="mt-2 grid gap-2">
          {advancedControls.map((control) => (
            <SliderRow
              key={control.key}
              label={control.label}
              max={1}
              min={0}
              step={0.01}
              value={macros[control.key]}
              onChange={(value) => setMacro(control.key, value)}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function getAgentStatus({
  isGenerating,
  source,
  warning,
}: {
  isGenerating: boolean;
  source: string;
  warning: string | null;
}) {
  if (isGenerating) {
    return { source: "gateway pending", warning: null };
  }

  const sourceLabel = source === "local-agent" ? "local patch" : source;

  if (warning && isTimeoutFallbackWarning(warning)) {
    return { source: sourceLabel, warning: null };
  }

  return { source: sourceLabel, warning };
}

function isTimeoutFallbackWarning(warning: string) {
  return /gateway timed out|timed out after|aborted due to timeout/i.test(warning);
}

function SynthPerformancePanel({
  currentStepIndex,
  isPlaying,
  scene,
}: {
  currentStepIndex: number | null;
  isPlaying: boolean;
  scene: SynthScene;
}) {
  const summary = summarizeSynthScene(scene);
  const bar =
    currentStepIndex === null
      ? 1
      : Math.floor(currentStepIndex / scene.stepsPerBar) + 1;

  return (
    <section className="border-b border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-zinc-100">
          <Waves className="size-4 text-zinc-300" />
          sound map
        </div>
        <div className="flex flex-wrap gap-2 text-zinc-500">
          <span>{summary.noteCount} notes</span>
          <span>{summary.activeVoiceCount} voices</span>
          <span>{isPlaying ? `bar ${bar}/${scene.bars}` : `${scene.bars} bars`}</span>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid gap-2">
          <ToneMeter label="warmth" value={summary.warmth} />
          <ToneMeter label="metal" value={summary.metal} />
          <ToneMeter label="space" value={summary.space} />
          <ToneMeter label="motion" value={summary.motion} />
        </div>
        <div className="grid gap-2">
          {scene.voices.map((voice) => {
            const activeSteps = voice.steps.filter((step) => step.active);
            const density = activeSteps.length / Math.max(1, voice.steps.length);
            const firstActive = activeSteps[0];

            return (
              <div
                className="grid gap-2 border border-zinc-800 bg-black/25 p-3 md:grid-cols-[150px_1fr_90px]"
                key={voice.id}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs text-zinc-100">{voice.label}</div>
                  <div className="mt-1 text-[11px] text-zinc-600">
                    {voice.role} - {voice.patch.rootWaveform}
                  </div>
                </div>
                <div className="flex h-8 items-center gap-1">
                  {voice.steps.slice(0, 64).map((step) => (
                    <span
                      aria-hidden="true"
                      className={`h-2 flex-1 rounded-sm ${
                        step.active ? "bg-zinc-100" : "bg-zinc-800"
                      }`}
                      key={step.step}
                      style={{
                        opacity: step.active
                          ? 0.35 + step.velocity * 0.65
                          : 0.45,
                      }}
                    />
                  ))}
                </div>
                <div className="text-right text-[11px] text-zinc-500">
                  <div>{formatPercent(density)}</div>
                  <div>{firstActive ? midiToNoteName(firstActive.midi) : "rest"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ToneMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1 text-xs">
      <div className="flex justify-between gap-3">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">{formatPercent(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-zinc-900">
        <div
          className="h-full rounded-sm bg-zinc-200"
          style={{ width: `${formatPercent(value)}` }}
        />
      </div>
    </div>
  );
}

function summarizeSynthScene(scene: SynthScene) {
  const activeSteps = scene.voices.flatMap((voice) =>
    voice.steps.filter((step) => step.active),
  );
  const averageModulationIndex = average(
    scene.voices.map((voice) => voice.patch.modulationIndex),
  );
  const averageHarmonicity = average(
    scene.voices.map((voice) => voice.patch.harmonicity),
  );
  const sineShare =
    scene.voices.filter((voice) => voice.patch.rootWaveform === "sine").length /
    Math.max(1, scene.voices.length);

  return {
    activeVoiceCount: scene.voices.filter((voice) =>
      voice.steps.some((step) => step.active),
    ).length,
    metal: clampUnit(
      (averageModulationIndex / 24) * 0.5 +
        (averageHarmonicity / 8) * 0.25 +
        scene.macros.brightness * 0.25,
    ),
    motion: clampUnit(scene.macros.evolution * 0.7 + scene.macros.analogDrift * 0.3),
    noteCount: activeSteps.length,
    space: clampUnit(scene.macros.dubSpace),
    warmth: clampUnit(
      (1 - scene.macros.brightness) * 0.28 +
        (1 - averageModulationIndex / 24) * 0.34 +
        scene.macros.dubSpace * 0.22 +
        sineShare * 0.16,
    ),
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function Sequencer({
  scene,
  currentStepIndex,
  selectedVoiceId,
  selectedStepIndex,
  setSelectedVoiceId,
  setSelectedStepIndex,
  toggleStep,
}: {
  scene: SynthScene;
  currentStepIndex: number | null;
  selectedVoiceId: string;
  selectedStepIndex: number | null;
  setSelectedVoiceId: (voiceId: string) => void;
  setSelectedStepIndex: (stepIndex: number | null) => void;
  toggleStep: (voiceId: string, stepIndex: number) => void;
}) {
  const totalSteps = scene.bars * scene.stepsPerBar;

  return (
    <section className="overflow-x-auto border-b border-zinc-800 p-4">
      <div
        className="grid min-w-[980px] gap-1"
        style={{ gridTemplateColumns: `150px repeat(${totalSteps}, minmax(18px, 1fr))` }}
      >
        <div className="text-xs text-zinc-500">voice</div>
        {Array.from({ length: totalSteps }, (_, step) => (
          <div key={step} className="text-center text-[10px] text-zinc-700">
            {step % 4 === 0 ? step + 1 : ""}
          </div>
        ))}
        {scene.voices.map((voice) => (
          <VoiceRow
            currentStepIndex={currentStepIndex}
            key={voice.id}
            selected={voice.id === selectedVoiceId}
            selectedStepIndex={selectedStepIndex}
            setSelectedStepIndex={setSelectedStepIndex}
            setSelectedVoiceId={setSelectedVoiceId}
            toggleStep={toggleStep}
            voice={voice}
          />
        ))}
      </div>
    </section>
  );
}

function VoiceRow({
  currentStepIndex,
  selected,
  selectedStepIndex,
  setSelectedStepIndex,
  setSelectedVoiceId,
  toggleStep,
  voice,
}: {
  currentStepIndex: number | null;
  selected: boolean;
  selectedStepIndex: number | null;
  setSelectedStepIndex: (stepIndex: number | null) => void;
  setSelectedVoiceId: (voiceId: string) => void;
  toggleStep: (voiceId: string, stepIndex: number) => void;
  voice: SynthVoice;
}) {
  return (
    <>
      <button
        type="button"
        className={`h-8 rounded-sm border px-2 text-left text-xs ${
          selected
            ? "border-zinc-200 text-zinc-100"
            : "border-zinc-800 text-zinc-500 hover:border-zinc-600"
        }`}
        onClick={() => setSelectedVoiceId(voice.id)}
      >
        {voice.label}
      </button>
      {voice.steps.map((step) => {
        const isCurrent = step.step === currentStepIndex;
        const isSelected = selected && step.step === selectedStepIndex;
        return (
          <button
            key={step.step}
            type="button"
            title={`${voice.label} ${midiToNoteName(step.midi)}`}
            className={`h-8 rounded-sm border text-[10px] transition ${
              step.active
                ? "border-zinc-200/70 bg-white/20 text-zinc-100"
                : "border-zinc-800 bg-zinc-950 text-zinc-700"
            } ${isCurrent ? "ring-1 ring-zinc-200" : ""} ${
              isSelected ? "outline outline-1 outline-zinc-100" : ""
            }`}
            onClick={(event) => {
              if (event.shiftKey) {
                toggleStep(voice.id, step.step);
                return;
              }
              setSelectedVoiceId(voice.id);
              setSelectedStepIndex(step.step);
            }}
            onDoubleClick={() => toggleStep(voice.id, step.step)}
          >
            {step.active ? midiToNoteName(step.midi).replace(/\d$/, "") : ""}
          </button>
        );
      })}
    </>
  );
}

function PatchPanel({
  selectedVoice,
  selectedStep,
  updateStep,
  updateVoicePatch,
}: {
  selectedVoice?: SynthVoice;
  selectedStep: SynthStep | null;
  updateStep: (voiceId: string, stepIndex: number, patch: Partial<SynthStep>) => void;
  updateVoicePatch: (voiceId: string, patch: Partial<VoicePatch>) => void;
}) {
  if (!selectedVoice) {
    return null;
  }

  return (
    <div className="border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r">
      <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
        <SlidersHorizontal className="size-4 text-zinc-200" />
        {selectedVoice.label}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-zinc-500">
          root wave
          <select
            className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
            value={selectedVoice.patch.rootWaveform}
            onChange={(event) =>
              updateVoicePatch(selectedVoice.id, {
                rootWaveform: event.target.value as SynthRootWaveform,
              })
            }
          >
            {rootWaveformOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <SliderRow
          label="fm index"
          max={48}
          min={0}
          step={0.1}
          value={selectedVoice.patch.modulationIndex}
          onChange={(value) => updateVoicePatch(selectedVoice.id, { modulationIndex: value })}
        />
        <SliderRow
          label="harmonicity"
          max={8}
          min={0.125}
          step={0.01}
          value={selectedVoice.patch.harmonicity}
          onChange={(value) => updateVoicePatch(selectedVoice.id, { harmonicity: value })}
        />
        <SliderRow
          label="attack"
          max={2}
          min={0.001}
          step={0.001}
          value={selectedVoice.patch.attack}
          onChange={(value) => updateVoicePatch(selectedVoice.id, { attack: value })}
        />
        <SliderRow
          label="release"
          max={8}
          min={0.01}
          step={0.01}
          value={selectedVoice.patch.release}
          onChange={(value) => updateVoicePatch(selectedVoice.id, { release: value })}
        />
      </div>
      <PartialBars partials={selectedVoice.patch.partials} />
      {selectedStep ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SliderRow
            label={`midi ${midiToNoteName(selectedStep.midi)}`}
            max={96}
            min={24}
            step={1}
            value={selectedStep.midi}
            onChange={(value) =>
              updateStep(selectedVoice.id, selectedStep.step, { midi: Math.round(value) })
            }
          />
          <SliderRow
            label="velocity"
            max={1}
            min={0}
            step={0.01}
            value={selectedStep.velocity}
            onChange={(value) =>
              updateStep(selectedVoice.id, selectedStep.step, { velocity: value })
            }
          />
          <SliderRow
            label="probability"
            max={1}
            min={0}
            step={0.01}
            value={selectedStep.probability}
            onChange={(value) =>
              updateStep(selectedVoice.id, selectedStep.step, { probability: value })
            }
          />
          <SliderRow
            label="length"
            max={16}
            min={1}
            step={1}
            value={selectedStep.lengthSteps}
            onChange={(value) =>
              updateStep(selectedVoice.id, selectedStep.step, {
                lengthSteps: Math.round(value),
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function EffectsPanel({
  scene,
  patchEffects,
}: {
  scene: SynthScene;
  patchEffects: (patch: Partial<SynthEffects>) => void;
}) {
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
        <Waves className="size-4 text-zinc-200" />
        effects
      </div>
      <div className="grid gap-3">
        <SliderRow
          label="filter"
          max={12000}
          min={80}
          step={1}
          value={scene.effects.filter.cutoffHz}
          onChange={(value) =>
            patchEffects({
              filter: { ...scene.effects.filter, cutoffHz: value },
            })
          }
        />
        <SliderRow
          label="resonance"
          max={18}
          min={0.1}
          step={0.1}
          value={scene.effects.filter.resonance}
          onChange={(value) =>
            patchEffects({
              filter: { ...scene.effects.filter, resonance: value },
            })
          }
        />
        <SliderRow
          label="delay wet"
          max={0.9}
          min={0}
          step={0.01}
          value={scene.effects.delay.wet}
          onChange={(value) =>
            patchEffects({
              delay: { ...scene.effects.delay, wet: value },
            })
          }
        />
        <SliderRow
          label="feedback"
          max={0.92}
          min={0}
          step={0.01}
          value={scene.effects.delay.feedback}
          onChange={(value) =>
            patchEffects({
              delay: { ...scene.effects.delay, feedback: value },
            })
          }
        />
        <SliderRow
          label="reverb"
          max={0.9}
          min={0}
          step={0.01}
          value={scene.effects.reverb.wet}
          onChange={(value) =>
            patchEffects({
              reverb: { ...scene.effects.reverb, wet: value },
            })
          }
        />
        <SliderRow
          label="drive"
          max={0.9}
          min={0}
          step={0.01}
          value={scene.effects.drive.amount}
          onChange={(value) =>
            patchEffects({
              drive: { ...scene.effects.drive, amount: value },
            })
          }
        />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="grid gap-1 text-xs text-zinc-500">
      <span className="flex items-center justify-between gap-3">
        {label}
        <span className="text-zinc-300">{formatControlValue(value)}</span>
      </span>
      <input
        className="w-full accent-zinc-200"
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function PartialBars({ partials }: { partials: number[] }) {
  return (
    <div className="mt-4 flex h-20 items-end gap-1 border border-zinc-800 bg-black px-2 py-2">
      {partials.map((partial, index) => (
        <div
          key={`${index}-${partial}`}
          className="flex-1 rounded-t-sm bg-white/70"
          style={{ height: `${Math.max(5, partial * 100).toFixed(4)}%` }}
        />
      ))}
    </div>
  );
}

function formatControlValue(value: number) {
  if (Math.abs(value) >= 10) {
    return Math.round(value).toString();
  }

  return value.toFixed(2);
}

function formatPercent(value: number) {
  return `${Math.round(clampUnit(value) * 100)}%`;
}
