import { z } from "zod";

import { describeSample } from "@/lib/ai/sample-descriptors";
import { isGatewayConfigured } from "@/lib/ai/gateway";
import { suggestSampleUseIdeas } from "@/lib/ai/sample-ideas";
import { recordPromptMemory } from "@/lib/prompt-memory/server";
import { SampleAnalysisSchema } from "@/lib/samples/analysis/schema";

const RequestSchema = z.object({
  analysis: SampleAnalysisSchema,
  intentPrompt: z.string().max(2000).optional(),
  sourceName: z.string().min(1).max(256).nullable().default(null),
  task: z.enum(["descriptors", "ideas", "all"]).optional(),
});

export type SampleAnalysisHandlerDeps = {
  describe?: typeof describeSample;
  isConfigured?: () => boolean;
  suggestIdeas?: typeof suggestSampleUseIdeas;
};

export async function handleSampleAnalysisRequest(
  request: Request,
  deps: SampleAnalysisHandlerDeps = {},
): Promise<Response> {
  const isConfigured = deps.isConfigured ?? isGatewayConfigured;
  const describe = deps.describe ?? describeSample;
  const suggestIdeas = deps.suggestIdeas ?? suggestSampleUseIdeas;

  if (!isConfigured()) {
    return Response.json(
      { error: "AI gateway is not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid sample-analysis request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const intentPrompt = parsed.data.intentPrompt?.trim() ?? "";
  const task = parsed.data.task ?? (intentPrompt ? "all" : "descriptors");

  await recordPromptMemory({
    action: task,
    metadata: {
      hasIntentPrompt: Boolean(intentPrompt),
      sourceName: parsed.data.sourceName,
    },
    route: "/api/sample-analysis",
    source: "api.sample-analysis",
    toolSlug: "sample-analysis",
    userPrompt: intentPrompt,
  });

  if (task === "ideas" && !intentPrompt) {
    return Response.json(
      { error: "intentPrompt is required for ideas" },
      { status: 400 },
    );
  }

  try {
    if (task === "ideas") {
      const ideas = await suggestIdeas({
        analysis: parsed.data.analysis,
        intentPrompt,
        sourceName: parsed.data.sourceName,
      });
      return Response.json({ ideas });
    }

    if (task === "descriptors" || !intentPrompt) {
      const descriptors = await describe({
        analysis: parsed.data.analysis,
        sourceName: parsed.data.sourceName,
      });
      return Response.json({ descriptors });
    }

    const [descriptors, ideas] = await Promise.all([
      describe({
        analysis: parsed.data.analysis,
        sourceName: parsed.data.sourceName,
      }),
      suggestIdeas({
        analysis: parsed.data.analysis,
        intentPrompt,
        sourceName: parsed.data.sourceName,
      }),
    ]);

    return Response.json({ descriptors, ideas });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to analyze sample",
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
