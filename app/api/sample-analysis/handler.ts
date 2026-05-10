import { z } from "zod";

import { describeSample } from "@/lib/ai/sample-descriptors";
import { isGatewayConfigured } from "@/lib/ai/gateway";
import { SampleAnalysisSchema } from "@/lib/samples/analysis/schema";

const RequestSchema = z.object({
  analysis: SampleAnalysisSchema,
  sourceName: z.string().min(1).max(256).nullable().default(null),
});

export type SampleAnalysisHandlerDeps = {
  describe?: typeof describeSample;
  isConfigured?: () => boolean;
};

export async function handleSampleAnalysisRequest(
  request: Request,
  deps: SampleAnalysisHandlerDeps = {},
): Promise<Response> {
  const isConfigured = deps.isConfigured ?? isGatewayConfigured;
  const describe = deps.describe ?? describeSample;

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

  try {
    const descriptors = await describe({
      analysis: parsed.data.analysis,
      sourceName: parsed.data.sourceName,
    });
    return Response.json({ descriptors });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to describe sample",
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
