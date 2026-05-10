import {
  TempoAgentRequestSchema,
  type TempoAgentOutput,
  type TempoAgentRequest,
} from "@/lib/music/tempo-agent.shared";

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

  const result = await deps.suggestTempoWithAgent(parsed.data);

  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
