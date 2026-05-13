import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";
import { buildHarmonicDistrotionEffectPrompt, buildHarmonicDistrotionEffectSystemPrompt } from "./prompt";

describe("harmonic-distrotion-effect effect prompt", () => {
  it("declares the L1 effect agent identity and audio-stream output contract", () => {
    const system = buildHarmonicDistrotionEffectSystemPrompt();
    expect(system.length).toBeGreaterThan(120);
    expect(system).toContain("audio-stream");
  });

  it("propagates the requested effect vibe and global tempo into the prompt", () => {
    const prompt = buildHarmonicDistrotionEffectPrompt({
      context: DEFAULT_GLOBAL_MUSIC_CONTEXT,
      prompt: "dub feedback delay",
    });
    expect(prompt.length).toBeGreaterThan(80);
    expect(prompt).toContain("dub feedback delay");
    expect(prompt).toContain(String(DEFAULT_GLOBAL_MUSIC_CONTEXT.bpm));
  });
});
