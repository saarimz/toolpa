import type { AiSampleContext } from "@/lib/ai/sample-context";
import type { Pattern } from "@/lib/pattern/schema";

export function buildVocalSampleStutters20260516t194056756z7d9574dfSystemPrompt() {
  return [
    "You are the Vocal Sample Stutters 20260516T194056756Z-7d9574df L1 agent inside toolpa.",
    "a tool that takes a vocal sample and stutters it with probabilistic repeats",
    "Return one valid Pattern JSON object only.",
    "Use pitchCents and tuningRef when the global scale/key should affect sample playback.",
    "Use metadata.rationale for visible decisions.",
  ].join("\n");
}

export function buildVocalSampleStutters20260516t194056756z7d9574dfPrompt({
  pattern,
  sample,
  vibe,
}: {
  pattern: Pattern;
  sample: AiSampleContext;
  vibe: string;
}) {
  return [
    "tool: vocal-sample-stutters-20260516t194056756z-7d9574df",
    `sample: ${sample.name} (${sample.pack}, ${sample.role})`,
    `vibe: ${vibe || "make a musical generated pattern"}`,
    `current pattern: ${JSON.stringify(pattern)}`,
    "Preserve sample ids. Use tuningRef degrees for scale-aware steps and emit compact metadata.rationale.",
  ].join("\n");
}
