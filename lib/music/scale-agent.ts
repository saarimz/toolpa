import "server-only";

import { Output, generateText } from "ai";

import { getGatewayModel, isGatewayConfigured } from "@/lib/ai/gateway";
import {
  buildScaleAgentPrompt,
  createDeterministicScaleChoice,
  getScaleAgentCandidates,
  ScaleAgentOutputSchema,
  ScaleAgentRequestSchema,
  type ScaleAgentOutput,
  type ScaleAgentRequest,
} from "@/lib/music/scale-agent.shared";

export async function chooseScaleWithAgent(
  input: ScaleAgentRequest,
): Promise<ScaleAgentOutput> {
  const parsed = ScaleAgentRequestSchema.parse(input);
  const candidates = getScaleAgentCandidates(parsed);

  if (!isGatewayConfigured()) {
    return createDeterministicScaleChoice(parsed);
  }

  try {
    const { output } = await generateText({
      model: getGatewayModel(),
      output: Output.object({ schema: ScaleAgentOutputSchema }),
      system:
        "You are a music-theory selector for ai-daw-tools. Pick key and scale choices from a provided candidate list only.",
      prompt: buildScaleAgentPrompt(parsed, candidates),
      temperature: 0.55,
    });

    const candidateIds = new Set(candidates.map((candidate) => candidate.scale.id));
    if (!candidateIds.has(output.selected.scaleId)) {
      return createDeterministicScaleChoice(parsed);
    }

    return ScaleAgentOutputSchema.parse(output);
  } catch {
    return createDeterministicScaleChoice(parsed);
  }
}
