import { PromptSuggestionsRequestSchema } from "@/lib/ai/contracts";
import type { PromptSuggestionsInput } from "@/lib/ai/prompt-suggestions.shared";
import { getAiSampleContext } from "@/lib/ai/sample-context";
import { getAgentManifest } from "@/lib/agents/registry";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export type SuggestionsHandlerDeps = {
  generatePromptSuggestions: (
    input: PromptSuggestionsInput,
  ) => Promise<string[]>;
};

export async function handleSuggestionsRequest(
  request: Request,
  deps: SuggestionsHandlerDeps,
): Promise<Response> {
  const parsed = PromptSuggestionsRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid suggestions request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const manifest = getAgentManifest(parsed.data.toolSlug);
  if (!manifest || manifest.status !== "enabled") {
    return Response.json({ error: "Tool is not enabled" }, { status: 404 });
  }

  const sample = parsed.data.context.sampleId
    ? getAiSampleContext({
        id: parsed.data.context.sampleId,
        name: parsed.data.context.sampleName,
        role: parsed.data.context.sampleRole,
      })
    : null;
  const secondarySample = parsed.data.context.secondarySampleId
    ? getAiSampleContext({
        id: parsed.data.context.secondarySampleId,
        name: parsed.data.context.secondarySampleName,
        role: parsed.data.context.secondarySampleRole,
      })
    : null;

  await recordPromptMemory({
    action: "suggestions",
    metadata: {
      bpm: parsed.data.context.bpm,
      sampleId: parsed.data.context.sampleId,
      sampleName: sample?.name,
      secondarySampleId: parsed.data.context.secondarySampleId,
      secondarySampleName: secondarySample?.name,
      swing: parsed.data.context.swing,
    },
    route: "/api/suggestions",
    source: "api.suggestions",
    toolSlug: parsed.data.toolSlug,
    userPrompt: parsed.data.prompt,
  });

  const suggestions = await deps.generatePromptSuggestions({
    toolSlug: parsed.data.toolSlug,
    prompt: parsed.data.prompt,
    sampleName: sample?.name,
    samplePack: sample?.pack,
    sampleRole: sample?.role,
    secondarySampleName: secondarySample?.name,
    secondarySampleRole: secondarySample?.role,
    bpm: parsed.data.context.bpm,
    swing: parsed.data.context.swing,
  });

  return Response.json({ suggestions });
}
