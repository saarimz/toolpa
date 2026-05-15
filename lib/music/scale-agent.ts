import "server-only";

import { Output, generateText } from "ai";

import {
  getConfiguredGatewayModelId,
  getGatewayModel,
  isGatewayConfigured,
} from "@/lib/ai/gateway";
import {
  buildScaleAgentPrompt,
  createDeterministicScaleChoice,
  getScaleAgentCandidates,
  ScaleAgentOutputSchema,
  ScaleAgentRequestSchema,
  type ScaleAgentOutput,
  type ScaleAgentRequest,
} from "@/lib/music/scale-agent.shared";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export async function chooseScaleWithAgent(
  input: ScaleAgentRequest,
): Promise<ScaleAgentOutput> {
  const parsed = ScaleAgentRequestSchema.parse(input);
  const candidates = getScaleAgentCandidates(parsed);

  if (!isGatewayConfigured()) {
    return createDeterministicScaleChoice(parsed);
  }

  try {
    const system =
      "You are a music-theory selector for toolpa. Pick key and scale choices from a provided candidate list only.";
    const prompt = buildScaleAgentPrompt(parsed, candidates);

    await recordPromptMemory({
      action: "scale-search",
      metadata: {
        candidateCount: candidates.length,
        tonic: parsed.tonic,
      },
      model: getConfiguredGatewayModelId(),
      resolvedPrompt: prompt,
      source: "ai.scale-agent",
      systemPrompt: system,
      toolSlug: "global-music-controls",
      userPrompt: parsed.prompt,
    });

    const { output } = await generateText({
      model: getGatewayModel(),
      output: Output.object({ schema: ScaleAgentOutputSchema }),
      system,
      prompt,
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
