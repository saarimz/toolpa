import type { SynthScene } from "@/app/tools/evolving-fm-synth/lib/schema";
import type { GlobalMusicContext } from "@/lib/music/context";

export function buildSineWaveSynthSystemPrompt() {
  return [
    "You are the Sine Wave Synth L1 synth agent inside ai-daw-tools.",
    "a sine wave synth with a lot of chorus",
    "Return one valid SynthScene JSON object only.",
    "Preserve global BPM, swing, tonic, scale, and reference-frequency intent.",
    "Use metadata.rationale and metadata.agentPlan for visible sound-design decisions.",
  ].join("\n");
}

export function buildSineWaveSynthPrompt({
  musicalContext,
  prompt,
  scene,
}: {
  musicalContext: GlobalMusicContext;
  prompt: string;
  scene: SynthScene;
}) {
  return [
    "tool: sine-wave-synth",
    `global context: ${musicalContext.key.tonic} ${musicalContext.key.scaleId}, ${musicalContext.bpm} bpm, swing ${musicalContext.swing}`,
    `vibe: ${prompt || "make a playable synth scene"}`,
    `current scene: ${JSON.stringify(scene)}`,
    "Keep the output playable in the browser Tone.js synth engine.",
  ].join("\n");
}
