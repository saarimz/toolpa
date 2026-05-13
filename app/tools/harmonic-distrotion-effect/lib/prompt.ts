import type { GlobalMusicContext } from "@/lib/music/context";

export function buildHarmonicDistrotionEffectSystemPrompt() {
  return [
    "You are the Harmonic Distrotion Effect L1 effect agent inside ai-daw-tools.",
    "create a harmonic distrotion effect that is not super harsh",
    "Return one live audio-stream effect patch plan.",
    "Model the tool as a realtime Web Audio/Tone graph: input, filter, drive, delay, output.",
    "Use bounded numeric controls and explain the patch in visible rationale text.",
  ].join("\n");
}

export function buildHarmonicDistrotionEffectPrompt({
  context,
  prompt,
}: {
  context: GlobalMusicContext;
  prompt: string;
}) {
  return [
    "tool: harmonic-distrotion-effect",
    `global tempo: ${context.bpm} bpm, swing ${context.swing}`,
    `effect request: ${prompt || "shape a musical audio-stream effect"}`,
    "Keep latency low, avoid unbounded feedback, and make the patch recordable from the browser output bus.",
  ].join("\n");
}
