import { describe, expect, it } from "vitest";
import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";
import { buildSineWaveSynthPrompt, buildSineWaveSynthSystemPrompt } from "./prompt";

describe("sine-wave-synth synth prompt", () => {
  it("declares the L1 synth agent identity and SynthScene output contract", () => {
    const system = buildSineWaveSynthSystemPrompt();
    expect(system.length).toBeGreaterThan(120);
    expect(system).toContain("SynthScene");
  });

  it("propagates global musical context and the user vibe into the per-request prompt", () => {
    const scene = createDefaultSynthScene("test synth");
    const prompt = buildSineWaveSynthPrompt({
      musicalContext: DEFAULT_GLOBAL_MUSIC_CONTEXT,
      prompt: "test vibe",
      scene,
    });
    expect(prompt.length).toBeGreaterThan(120);
    expect(prompt).toContain("test vibe");
    expect(prompt).toContain(String(DEFAULT_GLOBAL_MUSIC_CONTEXT.bpm));
  });
});
