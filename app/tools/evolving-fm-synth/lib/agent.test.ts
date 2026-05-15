import { describe, expect, it } from "vitest";

import {
  buildEvolvingFmSynthPrompt,
  buildEvolvingFmSynthSystemPrompt,
  createDefaultSynthScene,
  evolveSynthScene,
  generateSynthSceneFromPrompt,
  updateSceneKey,
  updateSceneMacro,
  updateSceneEvolutionBars,
} from "./agent";

describe("evolving fm synth agent", () => {
  it("turns explicit prompt controls into scene state", () => {
    const scene = generateSynthSceneFromPrompt({
      prompt:
        "key of F minor at 124 bpm, dub techno, use C2 Eb2 G2, sparse and dark",
      seed: 1234,
    });

    expect(scene.key).toBe("F");
    expect(scene.scale).toBe("minor");
    expect(scene.bpm).toBe(124);
    expect(scene.effects.delay.feedback).toBeGreaterThan(0.5);
    expect(scene.macros.density).toBeLessThan(0.5);
    expect(scene.voices.some((voice) => voice.steps.some((step) => step.midi === 36))).toBe(
      true,
    );
  });

  it("uses explicit root waveform prompt controls for the FM carrier", () => {
    const sineScene = generateSynthSceneFromPrompt({
      prompt: "sine root FM bass pattern in C minor",
      seed: 222,
    });
    const sawScene = generateSynthSceneFromPrompt({
      prompt: "saw root FM chord stabs in C minor",
      seed: 223,
    });

    expect(sineScene.voices.every((voice) => voice.patch.rootWaveform === "sine")).toBe(
      true,
    );
    expect(sawScene.voices.every((voice) => voice.patch.rootWaveform === "sawtooth")).toBe(
      true,
    );
    expect(sineScene.metadata.rationale).toContain("Carrier root starts from sine");
  });

  it("keeps warm patches rounder than explicitly metallic patches", () => {
    const warmScene = generateSynthSceneFromPrompt({
      prompt: "warm soft tape pad in C minor with mellow dub space",
      seed: 901,
    });
    const metallicScene = generateSynthSceneFromPrompt({
      prompt: "metallic glass bell acid FM in C minor with bright clang",
      seed: 901,
    });

    expect(countRootWaveform(warmScene, "sine")).toBeGreaterThanOrEqual(3);
    expect(averageModulationIndex(warmScene)).toBeLessThan(
      averageModulationIndex(metallicScene),
    );
    expect(warmScene.metadata.rationale).toContain("Timbre leans warm");
    expect(metallicScene.metadata.rationale).toContain("Timbre leans metallic");
  });

  it("preserves selected root waveforms when evolving without a new root prompt", () => {
    const scene = createDefaultSynthScene();
    const patched = {
      ...scene,
      voices: scene.voices.map((voice) => ({
        ...voice,
        patch: { ...voice.patch, rootWaveform: "square" as const },
      })),
    };

    const evolved = evolveSynthScene(patched, "make it more ancient and constantly evolving");

    expect(evolved.voices.every((voice) => voice.patch.rootWaveform === "square")).toBe(
      true,
    );
  });

  it("evolves from a previous scene without losing prompt rationale", () => {
    const first = createDefaultSynthScene();
    const evolved = evolveSynthScene(first, "make it more ancient and constantly evolving");

    expect(evolved.seed).not.toBe(first.seed);
    expect(evolved.metadata.rationale).toContain("Variation keeps");
    expect(evolved.macros.analogDrift).toBeGreaterThan(first.macros.analogDrift);
    expect(evolved.metadata.agentPlan).toHaveLength(5);
  });

  it("updates macros, key, and long evolution bars through schema-safe helpers", () => {
    const scene = createDefaultSynthScene();
    const brighter = updateSceneMacro(scene, "brightness", 0.9);
    const transposed = updateSceneKey(brighter, "D", "dorian");
    const longForm = updateSceneEvolutionBars(transposed, 128);

    expect(brighter.effects.filter.cutoffHz).toBeGreaterThan(scene.effects.filter.cutoffHz);
    expect(transposed.key).toBe("D");
    expect(transposed.scale).toBe("dorian");
    expect(transposed.voices[0]?.steps[0]?.midi).toBe(
      (brighter.voices[0]?.steps[0]?.midi ?? 0) + 2,
    );
    expect(longForm.bars).toBe(128);
    expect(longForm.stepsPerBar).toBe(4);
    expect(longForm.voices[0]?.steps).toHaveLength(512);
  });

  it("uses the global music context for BPM, key, and exotic scale ids", () => {
    const scene = generateSynthSceneFromPrompt({
      prompt: "slow evolving microtonal wash",
      musicalContext: {
        bpm: 172,
        swing: 0.05,
        key: { tonic: "A", scaleId: "quarter-tone-neutral", referenceFrequency: 440 },
      },
      seed: 55,
    });

    expect(scene.bpm).toBe(172);
    expect(scene.key).toBe("A");
    expect(scene.scale).toBe("quarter-tone-neutral");
    expect(scene.voices.some((voice) =>
      voice.steps.some((step) => step.tuningCents !== 0),
    )).toBe(true);
  });

  it("builds a prompt contract for gateway-backed generation", () => {
    const scene = createDefaultSynthScene();

    expect(buildEvolvingFmSynthSystemPrompt()).toContain("FM carrier root waveform");
    expect(buildEvolvingFmSynthPrompt({ prompt: "dub techno", scene })).toContain(
      "current macros",
    );
    expect(buildEvolvingFmSynthPrompt({ prompt: "dub techno", scene })).toContain(
      "root=",
    );
  });
});

function averageModulationIndex(scene: ReturnType<typeof createDefaultSynthScene>) {
  return (
    scene.voices.reduce((sum, voice) => sum + voice.patch.modulationIndex, 0) /
    scene.voices.length
  );
}

function countRootWaveform(
  scene: ReturnType<typeof createDefaultSynthScene>,
  waveform: "sine" | "wavetable" | "square" | "sawtooth",
) {
  return scene.voices.filter((voice) => voice.patch.rootWaveform === waveform).length;
}
