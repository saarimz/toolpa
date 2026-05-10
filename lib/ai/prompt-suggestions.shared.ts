import { z } from "zod";

export const PromptSuggestionsOutputSchema = z.object({
  suggestions: z.array(z.string().min(8).max(160)).length(3),
});

export type PromptSuggestionsOutput = z.infer<
  typeof PromptSuggestionsOutputSchema
>;

export type PromptSuggestionsInput = {
  toolSlug: string;
  prompt: string;
  sampleName?: string;
  samplePack?: string;
  sampleRole?: string;
  secondarySampleName?: string;
  secondarySampleRole?: string;
  bpm?: number;
  swing?: number;
  model?: string;
};

export function buildPromptSuggestionsPrompt(input: PromptSuggestionsInput) {
  return [
    `Tool: ${input.toolSlug}`,
    `Original prompt: ${input.prompt || "make a useful chopped sample pattern"}`,
    input.sampleName ? `Sample: ${input.sampleName}` : null,
    input.samplePack ? `Pack: ${input.samplePack}` : null,
    input.sampleRole ? `Role: ${input.sampleRole}` : null,
    input.secondarySampleName
      ? `Secondary sample: ${input.secondarySampleName} (${input.secondarySampleRole ?? "unknown"})`
      : null,
    input.bpm ? `BPM: ${input.bpm}` : null,
    input.swing !== undefined ? `Swing: ${input.swing}` : null,
    "",
    "Write three concise prompt suggestions for the user.",
    "Each suggestion should be a stronger variation of the original prompt, not a generic preset.",
    "Do not assume the source is Jungle Jungle or even a drum break; respond to the role and sample context.",
    "Keep each suggestion under 18 words and focused on audible sequencing decisions.",
  ]
    .filter(Boolean)
    .join("\n");
}
