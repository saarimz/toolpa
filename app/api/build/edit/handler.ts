import {
  BuildToolEditRequestSchema,
  encodeBuilderStreamChunk,
} from "@/lib/agents/builder-contracts";
import { SandboxBreach } from "@/lib/agents/sandbox";
import {
  runBuilderEditAgent,
  type RunBuilderEditAgentInput,
} from "@/app/tools/_builder/lib/builder-agent";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export type BuildEditHandlerDeps = {
  runEditAgent?: (input: RunBuilderEditAgentInput) => Promise<unknown>;
};

export async function handleBuildEditRequest(
  request: Request,
  deps: BuildEditHandlerDeps = {},
): Promise<Response> {
  const parsed = BuildToolEditRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid build-edit request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const runEditAgent = deps.runEditAgent ?? runBuilderEditAgent;

  await recordPromptMemory({
    action: "edit-tool",
    metadata: {
      register: parsed.data.register,
      tokenBudget: parsed.data.tokenBudget,
    },
    route: "/api/build/edit",
    source: "api.build.edit",
    toolSlug: parsed.data.slug,
    userPrompt: parsed.data.description,
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          await runEditAgent({
            ...parsed.data,
            abortSignal: request.signal,
            onChunk: (chunk) => controller.enqueue(encodeBuilderStreamChunk(chunk)),
          });
        } catch (error) {
          if (error instanceof SandboxBreach) {
            controller.enqueue(
              encodeBuilderStreamChunk({ type: "breach", message: error.message }),
            );
          } else {
            controller.enqueue(
              encodeBuilderStreamChunk({
                type: "error",
                message: error instanceof Error ? error.message : "Edit failed",
              }),
            );
          }
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
