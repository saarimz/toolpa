import "server-only";

import { Output, generateText } from "ai";

import { getGatewayModel } from "@/lib/ai/gateway";
import { compactAnalysisForPrompt } from "@/lib/ai/sample-descriptors";
import {
  SampleUseIdeasOutputSchema,
  type SampleUseIdeasOutput,
} from "@/lib/ai/sample-ideas.shared";
import type { SampleAnalysis } from "@/lib/samples/analysis/schema";

export type SuggestSampleUseIdeasInput = {
  analysis: SampleAnalysis;
  intentPrompt: string;
  sourceName: string | null;
  model?: string;
};

const SYSTEM_PROMPT = [
  "You are a producer assistant inside ai-daw-tools.",
  "You receive measured DSP analysis of one audio sample plus a user intent prompt.",
  "You do not hear the audio, so do not contradict measured BPM, key, role, duration, loudness, or transient facts.",
  "Return exactly five concrete production ideas.",
  "Each idea should explain how to use this sample and what to pair around it.",
].join(" ");

export async function suggestSampleUseIdeas(
  input: SuggestSampleUseIdeasInput,
): Promise<SampleUseIdeasOutput> {
  const compact = compactAnalysisForPrompt(input.analysis);
  const { output } = await generateText({
    model: getGatewayModel(input.model),
    output: Output.object({ schema: SampleUseIdeasOutputSchema }),
    system: SYSTEM_PROMPT,
    prompt: buildSampleUseIdeasPrompt({
      compact,
      intentPrompt: input.intentPrompt,
      sourceName: input.sourceName,
    }),
    temperature: 0.78,
  });

  return output;
}

export function buildSampleUseIdeasPrompt({
  compact,
  intentPrompt,
  sourceName,
}: {
  compact: Record<string, unknown>;
  intentPrompt: string;
  sourceName: string | null;
}): string {
  return [
    sourceName ? `Sample filename: ${sourceName}` : "",
    `User intent: ${intentPrompt || "I want useful ways to use or complement this sample."}`,
    "",
    "Measured DSP features:",
    "```json",
    JSON.stringify(compact, null, 2),
    "```",
    "",
    "Return JSON with exactly five ideas. Each idea must include:",
    "- title: short label",
    "- approach: how to use this sample in an arrangement or tool",
    "- complement: what to pair with it, such as drums, bass, harmony, texture, FX, or another sample role",
    "- productionMove: one concrete editing, sequencing, mixing, or sound-design move",
  ].filter(Boolean).join("\n");
}
