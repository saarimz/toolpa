import {
  encodeStreamChunk,
  GeneratePatternRequestSchema,
} from "@/lib/ai/contracts";
import type {
  PatternStreamResult,
  StreamPatternInput,
} from "@/lib/ai/pattern-generation";
import type {
  GridToolTrace,
  RunGridToolAgentInput,
} from "@/lib/ai/grid-tool-agent";
import { getAiSampleContext } from "@/lib/ai/sample-context";
import { resolveToolPrompts } from "@/lib/agents/dispatch";
import { getAgentManifest } from "@/lib/agents/registry";
import { PatternSchema } from "@/lib/pattern/schema";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export type GenerateHandlerDeps = {
  streamPattern: (input: StreamPatternInput) => Promise<PatternStreamResult>;
  runGridToolAgent?: (input: RunGridToolAgentInput) => Promise<GridToolTrace[]>;
};

export async function handleGenerateRequest(
  request: Request,
  deps: GenerateHandlerDeps,
): Promise<Response> {
  const parsed = GeneratePatternRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid generate request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const manifest = getAgentManifest(parsed.data.toolSlug);
  if (!manifest || manifest.status !== "enabled") {
    return Response.json({ error: "Tool is not enabled" }, { status: 404 });
  }

  const pattern = PatternSchema.parse(parsed.data.context.pattern);
  const requiredAnalysis = manifest.inputs.requiredAnalysis;
  const sample = getAiSampleContext({
    id: parsed.data.context.sampleId,
    name: parsed.data.context.sampleName,
    role: parsed.data.context.sampleRole,
    providedAnalysis: parsed.data.context.sampleAnalysis ?? null,
    requiredAnalysis,
  });
  const secondarySample = parsed.data.context.secondarySampleId
    ? getAiSampleContext({
        id: parsed.data.context.secondarySampleId,
        name: parsed.data.context.secondarySampleName,
        role: parsed.data.context.secondarySampleRole,
        providedAnalysis: parsed.data.context.secondarySampleAnalysis ?? null,
        requiredAnalysis,
      })
    : null;

  const { system, prompt } = resolveToolPrompts({
    toolSlug: manifest.slug,
    pattern,
    sample,
    secondarySample,
    bpm: parsed.data.context.bpm,
    swing: parsed.data.context.swing,
    sampleMode: parsed.data.context.sampleMode,
    trackSamples: parsed.data.context.trackSamples,
    vibe: parsed.data.prompt,
    sliceCount: parsed.data.context.sliceCount,
    traversal: parsed.data.context.traversal,
    musicalContext: parsed.data.context.musicalContext,
    agentMode: parsed.data.agentMode,
  });

  await recordPromptMemory({
    action: parsed.data.mode,
    metadata: {
      agentMode: parsed.data.agentMode,
      bpm: parsed.data.context.bpm,
      sampleId: parsed.data.context.sampleId,
      sampleName: sample.name,
      secondarySampleId: parsed.data.context.secondarySampleId,
      swing: parsed.data.context.swing,
    },
    resolvedPrompt: prompt,
    route: "/api/generate",
    source: "api.generate",
    systemPrompt: system,
    toolSlug: manifest.slug,
    userPrompt: parsed.data.prompt,
  });

  const result = await deps.streamPattern({ system, prompt });

  return new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(encodeStreamChunk({ type: "prompt", system, prompt }));
        if (parsed.data.agentMode === "tool-calling" && manifest.slug === "grid-sampler") {
          const toolCalls = deps.runGridToolAgent
            ? await deps.runGridToolAgent({
                prompt: parsed.data.prompt,
                sliceCount: parsed.data.context.sliceCount ?? 64,
                traversal: parsed.data.context.traversal ?? "LR_serp",
              })
            : createTransparentToolCalls({
                toolSlug: manifest.slug,
                prompt: parsed.data.prompt,
                sliceCount: parsed.data.context.sliceCount,
                traversal: parsed.data.context.traversal,
              });

          for (const toolCall of toolCalls) {
            controller.enqueue(encodeStreamChunk({ type: "tool-call", ...toolCall }));
          }
        }

        try {
          for await (const partial of result.partialOutputStream) {
            controller.enqueue(encodeStreamChunk({ type: "partial", pattern: partial }));
          }

          controller.enqueue(
            encodeStreamChunk({ type: "final", pattern: await result.output }),
          );
        } catch (error) {
          controller.enqueue(
            encodeStreamChunk({
              type: "error",
              message: error instanceof Error ? error.message : "Generation failed",
            }),
          );
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

function createTransparentToolCalls({
  toolSlug,
  prompt,
  sliceCount,
  traversal,
}: {
  toolSlug: string;
  prompt: string;
  sliceCount?: number;
  traversal?: string;
}) {
  if (toolSlug !== "grid-sampler") {
    return [];
  }

  return [
    {
      name: "chop",
      input: { sliceCount: sliceCount ?? 64 },
      result: { cells: sliceCount ?? 64 },
    },
    {
      name: "place",
      input: { prompt, traversal: traversal ?? "LR_serp" },
      result: { strategy: "density and microtiming from prompt" },
    },
    {
      name: "audition",
      input: { pass: 1 },
      result: { accepted: true, notes: "transparent dry-run before final pattern" },
    },
  ];
}
