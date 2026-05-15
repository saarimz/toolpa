import "server-only";

import { Output, generateText } from "ai";

import { getGatewayModel, isGatewayConfigured } from "@/lib/ai/gateway";
import {
  buildTempoAgentPrompt,
  createDeterministicTempoChoice,
  getTempoAgentBands,
  TempoAgentOutputSchema,
  TempoAgentRequestSchema,
  type TempoAgentOutput,
  type TempoAgentRequest,
} from "@/lib/music/tempo-agent.shared";

export async function suggestTempoWithAgent(
  input: TempoAgentRequest,
): Promise<TempoAgentOutput> {
  const parsed = TempoAgentRequestSchema.parse(input);
  const candidates = getTempoAgentBands(parsed);

  if (!isGatewayConfigured()) {
    return createDeterministicTempoChoice(parsed);
  }

  try {
    const { output } = await generateText({
      model: getGatewayModel(),
      output: Output.object({ schema: TempoAgentOutputSchema }),
      system:
        "You are a groove and tempo selector for toolpa. Suggest practical global BPM and swing values from a genre prompt.",
      prompt: buildTempoAgentPrompt(parsed, candidates),
      temperature: 0.55,
    });

    return TempoAgentOutputSchema.parse(output);
  } catch {
    return createDeterministicTempoChoice(parsed);
  }
}
