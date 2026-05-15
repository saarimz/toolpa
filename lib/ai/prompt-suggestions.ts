import "server-only";

import { Output, generateText } from "ai";

import { getConfiguredGatewayModelId, getGatewayModel } from "@/lib/ai/gateway";
import {
  buildPromptSuggestionsPrompt,
  type PromptSuggestionsInput,
  PromptSuggestionsOutputSchema,
} from "@/lib/ai/prompt-suggestions.shared";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export async function generatePromptSuggestions(
  input: PromptSuggestionsInput,
): Promise<string[]> {
  const system =
    "You generate concise prompt suggestion chips for transparent AI music tools.";
  const prompt = buildPromptSuggestionsPrompt(input);

  await recordPromptMemory({
    action: "prompt-suggestions",
    metadata: {
      bpm: input.bpm,
      sampleName: input.sampleName,
      secondarySampleName: input.secondarySampleName,
      swing: input.swing,
    },
    model: input.model ?? getConfiguredGatewayModelId(),
    resolvedPrompt: prompt,
    source: "ai.prompt-suggestions",
    systemPrompt: system,
    toolSlug: input.toolSlug,
    userPrompt: input.prompt,
  });

  const { output } = await generateText({
    model: getGatewayModel(input.model),
    output: Output.object({ schema: PromptSuggestionsOutputSchema }),
    system,
    prompt,
    temperature: 0.9,
  });

  return output.suggestions;
}
