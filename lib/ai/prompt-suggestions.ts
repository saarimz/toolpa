import "server-only";

import { Output, generateText } from "ai";

import { getGatewayModel } from "@/lib/ai/gateway";
import {
  buildPromptSuggestionsPrompt,
  type PromptSuggestionsInput,
  PromptSuggestionsOutputSchema,
} from "@/lib/ai/prompt-suggestions.shared";

export async function generatePromptSuggestions(
  input: PromptSuggestionsInput,
): Promise<string[]> {
  const { output } = await generateText({
    model: getGatewayModel(input.model),
    output: Output.object({ schema: PromptSuggestionsOutputSchema }),
    system:
      "You generate concise prompt suggestion chips for transparent AI music tools.",
    prompt: buildPromptSuggestionsPrompt(input),
    temperature: 0.9,
  });

  return output.suggestions;
}
