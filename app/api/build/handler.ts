import {
  BuildToolRequestSchema,
  encodeBuilderStreamChunk,
} from "@/lib/agents/builder-contracts";
import { SandboxBreach } from "@/lib/agents/sandbox";
import {
  runBuilderAgent,
  type RunBuilderAgentInput,
} from "@/app/tools/_builder/lib/builder-agent";

export type BuildHandlerDeps = {
  runBuilder?: (input: RunBuilderAgentInput) => Promise<unknown>;
};

export async function handleBuildRequest(
  request: Request,
  deps: BuildHandlerDeps = {},
): Promise<Response> {
  const parsed = BuildToolRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid build request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const runBuilder = deps.runBuilder ?? runBuilderAgent;

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          await runBuilder({
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
                message: error instanceof Error ? error.message : "Build failed",
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
