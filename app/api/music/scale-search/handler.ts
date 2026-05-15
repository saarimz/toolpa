import {
  ScaleAgentRequestSchema,
  type ScaleAgentOutput,
  type ScaleAgentRequest,
} from "@/lib/music/scale-agent.shared";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export type ScaleSearchHandlerDeps = {
  chooseScaleWithAgent: (input: ScaleAgentRequest) => Promise<ScaleAgentOutput>;
};

export async function handleScaleSearchRequest(
  request: Request,
  deps: ScaleSearchHandlerDeps,
): Promise<Response> {
  const parsed = ScaleAgentRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid scale-search request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await recordPromptMemory({
    action: "scale-search",
    metadata: { tonic: parsed.data.tonic },
    route: "/api/music/scale-search",
    source: "api.music.scale-search",
    toolSlug: "global-music-controls",
    userPrompt: parsed.data.prompt,
  });

  const result = await deps.chooseScaleWithAgent(parsed.data);

  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
