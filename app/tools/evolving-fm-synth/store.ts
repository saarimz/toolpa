"use client";

import { create } from "zustand";

import {
  createDefaultSynthScene,
  evolveSynthScene,
  generateSynthSceneFromPrompt,
  updateSceneBpm,
  updateSceneEvolutionBars,
  updateSceneKey,
  updateSceneMacro,
} from "@/app/tools/evolving-fm-synth/lib/agent";
import {
  SynthSceneSchema,
  type EvolutionBars,
  type SynthEffects,
  type SynthMacros,
  type SynthScale,
  type SynthScene,
  type SynthStep,
  type VoicePatch,
} from "@/app/tools/evolving-fm-synth/lib/schema";
import type { GlobalMusicContext } from "@/lib/music/context";

type EvolvingFmSynthStore = {
  prompt: string;
  scene: SynthScene;
  isPlaying: boolean;
  currentStepIndex: number | null;
  selectedVoiceId: string;
  selectedStepIndex: number | null;
  generationCount: number;
  setPrompt: (prompt: string) => void;
  setScene: (scene: SynthScene) => void;
  generate: (musicalContext?: GlobalMusicContext) => void;
  evolve: (musicalContext?: GlobalMusicContext) => void;
  setPlaying: (isPlaying: boolean) => void;
  setCurrentStepIndex: (currentStepIndex: number | null) => void;
  setSelectedVoiceId: (selectedVoiceId: string) => void;
  setSelectedStepIndex: (selectedStepIndex: number | null) => void;
  setMacro: (macro: keyof SynthMacros, value: number) => void;
  setBpm: (bpm: number) => void;
  setEvolutionBars: (bars: EvolutionBars) => void;
  setKeyAndScale: (key: string, scale?: SynthScale) => void;
  toggleStep: (voiceId: string, stepIndex: number) => void;
  updateStep: (
    voiceId: string,
    stepIndex: number,
    patch: Partial<SynthStep>,
  ) => void;
  updateVoicePatch: (
    voiceId: string,
    patch: Partial<VoicePatch>,
  ) => void;
  updateEffects: (patch: Partial<SynthEffects>) => void;
};

const defaultPrompt =
  "dub techno in F minor at 124 bpm over 32 bars, evolving pads, warm tape drift, deep feedback delay";

export const useEvolvingFmSynthStore = create<EvolvingFmSynthStore>((set) => {
  const scene = createDefaultSynthScene(defaultPrompt);

  return {
    prompt: defaultPrompt,
    scene,
    isPlaying: false,
    currentStepIndex: null,
    selectedVoiceId: scene.voices[0]?.id ?? "sub-fm",
    selectedStepIndex: null,
    generationCount: 0,
    setPrompt(prompt) {
      set({ prompt });
    },
    setScene(nextScene) {
      const parsed = SynthSceneSchema.parse(nextScene);
      set({
        scene: parsed,
        selectedVoiceId: parsed.voices[0]?.id ?? "sub-fm",
        selectedStepIndex: null,
      });
    },
    generate(musicalContext) {
      set((state) => {
        const nextScene = generateSynthSceneFromPrompt({
          musicalContext,
          prompt: state.prompt,
          seed: state.generationCount + 72417,
        });
        return {
          scene: nextScene,
          selectedVoiceId: nextScene.voices[0]?.id ?? state.selectedVoiceId,
          selectedStepIndex: null,
          generationCount: state.generationCount + 1,
        };
      });
    },
    evolve(musicalContext) {
      set((state) => {
        const nextScene = evolveSynthScene(state.scene, state.prompt, musicalContext);
        return {
          scene: nextScene,
          selectedVoiceId: nextScene.voices[0]?.id ?? state.selectedVoiceId,
          selectedStepIndex: null,
          generationCount: state.generationCount + 1,
        };
      });
    },
    setPlaying(isPlaying) {
      set({ isPlaying });
    },
    setCurrentStepIndex(currentStepIndex) {
      set({ currentStepIndex });
    },
    setSelectedVoiceId(selectedVoiceId) {
      set({ selectedVoiceId, selectedStepIndex: null });
    },
    setSelectedStepIndex(selectedStepIndex) {
      set({ selectedStepIndex });
    },
    setMacro(macro, value) {
      set((state) => ({ scene: updateSceneMacro(state.scene, macro, value) }));
    },
    setBpm(bpm) {
      set((state) => ({ scene: updateSceneBpm(state.scene, bpm) }));
    },
    setEvolutionBars(bars) {
      set((state) => ({
        scene: updateSceneEvolutionBars(state.scene, bars),
        selectedStepIndex: null,
      }));
    },
    setKeyAndScale(key, scale) {
      set((state) => ({ scene: updateSceneKey(state.scene, key, scale) }));
    },
    toggleStep(voiceId, stepIndex) {
      set((state) => ({
        scene: SynthSceneSchema.parse({
          ...state.scene,
          voices: state.scene.voices.map((voice) =>
            voice.id === voiceId
              ? {
                  ...voice,
                  steps: voice.steps.map((step) =>
                    step.step === stepIndex
                      ? { ...step, active: !step.active }
                      : step,
                  ),
                }
              : voice,
          ),
        }),
        selectedVoiceId: voiceId,
        selectedStepIndex: stepIndex,
      }));
    },
    updateStep(voiceId, stepIndex, patch) {
      set((state) => ({
        scene: SynthSceneSchema.parse({
          ...state.scene,
          voices: state.scene.voices.map((voice) =>
            voice.id === voiceId
              ? {
                  ...voice,
                  steps: voice.steps.map((step) =>
                    step.step === stepIndex
                      ? { ...step, ...patch, step: step.step }
                      : step,
                  ),
                }
              : voice,
          ),
        }),
      }));
    },
    updateVoicePatch(voiceId, patch) {
      set((state) => ({
        scene: SynthSceneSchema.parse({
          ...state.scene,
          voices: state.scene.voices.map((voice) =>
            voice.id === voiceId
              ? { ...voice, patch: { ...voice.patch, ...patch } }
              : voice,
          ),
        }),
      }));
    },
    updateEffects(patch) {
      set((state) => ({
        scene: SynthSceneSchema.parse({
          ...state.scene,
          effects: {
            ...state.scene.effects,
            ...patch,
          },
        }),
      }));
    },
  };
});
