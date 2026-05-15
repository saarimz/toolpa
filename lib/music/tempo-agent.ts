import "server-only";

import { Output, generateText } from "ai";

import {
  getConfiguredGatewayModelId,
  getGatewayModel,
  isGatewayConfigured,
} from "@/lib/ai/gateway";
import {
  buildTempoAgentPrompt,
  createDeterministicTempoChoice,
  getTempoAgentBands,
  TempoAgentOutputSchema,
  TempoAgentRequestSchema,
  type TempoAgentOutput,
  type TempoAgentRequest,
} from "@/lib/music/tempo-agent.shared";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export async function suggestTempoWithAgent(
  input: TempoAgentRequest,
): Promise<TempoAgentOutput> {
  const parsed = TempoAgentRequestSchema.parse(input);
  const candidates = getTempoAgentBands(parsed);

  if (!isGatewayConfigured()) {
    return createDeterministicTempoChoice(parsed);
  }

  try {
    const system =
      "You are a groove and tempo selector for toolpa. Suggest practical global BPM and swing values from a genre prompt.";
    const prompt = buildTempoAgentPrompt(parsed, candidates);

    await recordPromptMemory({
      action: "tempo-suggest",
      metadata: {
        candidateCount: candidates.length,
        currentBpm: parsed.context?.bpm,
      },
      model: getConfiguredGatewayModelId(),
      resolvedPrompt: prompt,
      source: "ai.tempo-agent",
      systemPrompt: system,
      toolSlug: "global-music-controls",
      userPrompt: parsed.prompt,
    });

    const { output } = await generateText({
      model: getGatewayModel(),
      output: Output.object({ schema: TempoAgentOutputSchema }),
      system,
      prompt,
      temperature: 0.55,
    });

    return TempoAgentOutputSchema.parse(output);
  } catch {
    return createDeterministicTempoChoice(parsed);
  }
}
