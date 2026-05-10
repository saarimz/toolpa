"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  Copy,
  Pause,
  Play,
  RefreshCcw,
  SlidersHorizontal,
  Sparkles,
  Waves,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { AudioOutputRecorder } from "@/components/audio-output-recorder";
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
import {
  midiToNoteName,
  getScaleDisplayName,
  type EvolutionBars,
  type SynthEffects,
  type SynthMacros,
  type SynthScale,
  type SynthScene,
  type SynthStep,
  type SynthVoice,
  type VoicePatch,
} from "@/app/tools/evolving-fm-synth/lib/schema";
import { useEvolvingFmSynthStore } from "@/app/tools/evolving-fm-synth/store";
import { useGlobalSynthContextSync } from "@/lib/music/use-global-context-sync";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

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

const macroControls: Array<{
  key: keyof SynthMacros;
  label: string;
}> = [
  { key: "evolution", label: "evolution" },
  { key: "mutationDepth", label: "mutation" },
  { key: "brightness", label: "brightness" },
  { key: "dubSpace", label: "dub space" },
  { key: "density", label: "density" },
  { key: "analogDrift", label: "drift" },
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
  useGlobalSynthContextSync({ setBpm, setKeyAndScale });

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

  async function togglePlayback() {
    if (isPlaying) {
      await stopTransport();
      return;
    }

    await restartTransport(scene);
  }

  async function restartTransport(nextScene: SynthScene) {
    await playEvolvingFmSynthScene(nextScene);
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
    generate(globalMusicContext);
    setAgentSource("local-agent");
    setAgentError(null);
    if (isPlaying) {
      await restartTransport(useEvolvingFmSynthStore.getState().scene);
    }
    void requestGatewayScene("generate", isPlaying);
  }

  async function evolveScene() {
    evolve(globalMusicContext);
    setAgentSource("local-agent");
    setAgentError(null);
    if (isPlaying) {
      await restartTransport(useEvolvingFmSynthStore.getState().scene);
    }
    void requestGatewayScene("evolve", isPlaying);
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
    <main className="min-h-screen bg-[#050706] text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-emerald-200">
            /dashboard
          </Link>
          <h1 className="mt-1 text-lg tracking-normal text-zinc-100">
            evolving-fm-synth
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>L1</span>
          <span className="text-emerald-300">agentic</span>
          <span>{scene.key} {getScaleDisplayName(scene.scale)}</span>
          <span>{scene.bpm} bpm</span>
        </div>
      </header>

      <section className="grid border-b border-zinc-800 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative overflow-hidden border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r">
          {isAiGenerating ? (
            <LlmGeneratingOverlay
              detail="Prompting the LLM for an evolving FM synth scene."
              label="generating synth prompt"
              tone="emerald"
            />
          ) : null}

          <div className="mb-3 flex flex-wrap gap-2">
            {promptSeeds.map((seed) => (
              <button
                key={seed}
                type="button"
                className="rounded-sm border border-zinc-800 px-3 py-2 text-left text-xs text-zinc-400 hover:border-emerald-300 hover:text-emerald-100"
                onClick={() => setPrompt(seed)}
              >
                {seed}
              </button>
            ))}
          </div>
          <label className="block text-xs text-zinc-500">
            synth prompt
            <textarea
              className="mt-2 h-28 w-full resize-none rounded-sm border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-100 outline-none focus:border-emerald-300"
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
            <AudioOutputRecorder filename={scene.name} />
            <Button
              onClick={() =>
                void navigator.clipboard.writeText(JSON.stringify(scene, null, 2))
              }
            >
              <Copy className="size-4" />
              copy json
            </Button>
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
              min={40}
              max={260}
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
      </section>

      <Sequencer
        scene={scene}
        currentStepIndex={currentStepIndex}
        selectedVoiceId={selectedVoiceId}
        selectedStepIndex={selectedStepIndex}
        setSelectedVoiceId={setSelectedVoiceId}
        setSelectedStepIndex={setSelectedStepIndex}
        toggleStep={toggleStep}
      />

      <section className="grid border-b border-zinc-800 lg:grid-cols-[minmax(0,1fr)_420px]">
        <PatchPanel
          selectedVoice={selectedVoice}
          selectedStep={selectedStep}
          updateStep={updateStep}
          updateVoicePatch={updateVoicePatch}
        />
        <EffectsPanel scene={scene} patchEffects={patchEffects} />
      </section>

      <section className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
            <BrainCircuit className="size-4 text-emerald-300" />
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
            <Zap className="size-4 text-emerald-300" />
            prompt contract
          </div>
          <pre className="max-h-56 overflow-auto text-[11px] leading-5 text-emerald-100">
            {[buildEvolvingFmSynthSystemPrompt(), "", agentPrompt].join("\n")}
          </pre>
        </div>
      </section>
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
  return (
    <div className="grid gap-2">
      {macroControls.map((control) => (
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
            ? "border-emerald-300 text-emerald-100"
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
                ? "border-emerald-300/70 bg-emerald-300/20 text-emerald-100"
                : "border-zinc-800 bg-zinc-950 text-zinc-700"
            } ${isCurrent ? "ring-1 ring-cyan-300" : ""} ${
              isSelected ? "outline outline-1 outline-emerald-100" : ""
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
        <SlidersHorizontal className="size-4 text-emerald-300" />
        {selectedVoice.label}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
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
        <Waves className="size-4 text-emerald-300" />
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
        className="w-full accent-emerald-300"
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
          className="flex-1 rounded-t-sm bg-emerald-300/70"
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
