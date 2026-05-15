import {
  BuildToolRequestSchema,
  encodeBuilderStreamChunk,
} from "@/lib/agents/builder-contracts";
import { SandboxBreach } from "@/lib/agents/sandbox";
import {
  runBuilderAgent,
  runBuilderToolLoopAgent,
  type RunBuilderToolLoopAgentInput,
} from "@/app/tools/_builder/lib/builder-agent";

export type BuildHandlerDeps = {
  runBuilder?: (input: RunBuilderToolLoopAgentInput) => Promise<unknown>;
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

  const runBuilder = deps.runBuilder ?? getDefaultBuildRunner();

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

function getDefaultBuildRunner() {
  return (input: RunBuilderToolLoopAgentInput) => {
    if (process.env.TOOLPA_JS_BUILDER_MODE === "tool-loop") {
      return runBuilderToolLoopAgent({
        ...input,
        timeoutMs: input.timeoutMs ?? getBuilderTimeoutMs(),
      });
    }

    return runBuilderAgent(input);
  };
}

function getBuilderTimeoutMs() {
  const raw = Number(process.env.TOOLPA_JS_BUILDER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 90_000;
}
