import { describe, expect, it } from "vitest";

import { createDefaultVisualizerScene } from "@/lib/visualizers/schema";
import {
  buildAudioVisualizerPrompt,
  buildAudioVisualizerSystemPrompt,
  createVisualizerSceneFromPrompt,
} from "@/app/tools/audio-visualizer/lib/prompt";

describe("audio visualizer prompt helpers", () => {
  it("declares an audio-reactive visual-scene output contract", () => {
    const system = buildAudioVisualizerSystemPrompt();

    expect(system).toContain("VisualizerScene");
    expect(system).toContain("FFT");
    expect(system).toContain("not random");
  });

  it("propagates current scene and requested direction into the prompt", () => {
    const scene = createDefaultVisualizerScene("spectrogram");
    const prompt = buildAudioVisualizerPrompt({
      prompt: "bass reactive tunnel",
      scene,
    });

    expect(prompt).toContain("bass reactive tunnel");
    expect(prompt).toContain("visual-scene");
    expect(prompt).toContain(scene.id);
  });

  it("maps prompt terms to mode, palette, features, and micro fluctuation", () => {
    const scene = createVisualizerSceneFromPrompt(
      "intense prism particle field driven by kick bass with organic micro fluctuations",
    );

    expect(scene.mode).toBe("particle-field");
    expect(scene.palette).toBe("prism");
    expect(scene.source).toBe("live-audio");
    expect(scene.mapping.primaryFeature).toBe("bass");
    expect(scene.motion.microFluctuation).toBeGreaterThan(0.2);
    expect(scene.metadata.rationale).toContain("FFT bands");
  });

  it("keeps recorded and microphone prompts on the requested live analyser source", () => {
    expect(createVisualizerSceneFromPrompt("recorded file spectrogram").source).toBe("audio-file");
    expect(createVisualizerSceneFromPrompt("microphone room radial bloom").source).toBe("microphone");
  });
});
