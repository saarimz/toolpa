import {
  TempoAgentRequestSchema,
  type TempoAgentOutput,
  type TempoAgentRequest,
} from "@/lib/music/tempo-agent.shared";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export type TempoSuggestHandlerDeps = {
  suggestTempoWithAgent: (input: TempoAgentRequest) => Promise<TempoAgentOutput>;
};

export async function handleTempoSuggestRequest(
  request: Request,
  deps: TempoSuggestHandlerDeps,
): Promise<Response> {
  const parsed = TempoAgentRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid tempo-suggest request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await recordPromptMemory({
    action: "tempo-suggest",
    metadata: { currentBpm: parsed.data.context?.bpm },
    route: "/api/music/tempo-suggest",
    source: "api.music.tempo-suggest",
    toolSlug: "global-music-controls",
    userPrompt: parsed.data.prompt,
  });

  const result = await deps.suggestTempoWithAgent(parsed.data);

  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
