import "server-only";

import { stepCountIs, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getGatewayModel } from "@/lib/ai/gateway";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export type GridToolTrace = {
  name: string;
  input: unknown;
  result: unknown;
};

export type RunGridToolAgentInput = {
  prompt: string;
  sliceCount: number;
  traversal: string;
  model?: string;
};

export async function runGridToolAgent({
  prompt,
  sliceCount,
  traversal,
  model,
}: RunGridToolAgentInput): Promise<GridToolTrace[]> {
  const traces: GridToolTrace[] = [];
  const instructions = [
    "You are the grid-sampler tool-calling agent.",
    "Call chop first, then place, then audition. Use regenerate if audition fails.",
    "Stop after you have a usable placement plan.",
  ].join("\n");

  const agent = new ToolLoopAgent({
    model: getGatewayModel(model),
    instructions,
    stopWhen: stepCountIs(5),
    tools: {
      chop: tool({
        description: "Choose the chop resolution for a 2D sample grid.",
        inputSchema: z.object({
          requestedSlices: z.number().int().min(1).max(256),
        }),
        execute: async (input) =>
          recordTrace(traces, "chop", input, {
            sliceCount,
            accepted: input.requestedSlices === sliceCount,
          }),
      }),
      place: tool({
        description: "Choose traversal and density placement rules.",
        inputSchema: z.object({
          traversal: z.string(),
          density: z.enum(["sparse", "medium", "dense"]),
          microtiming: z.string().optional(),
        }),
        execute: async (input) =>
          recordTrace(traces, "place", input, {
            traversal,
            density: input.density,
            prompt,
          }),
      }),
      audition: tool({
        description: "Evaluate whether the proposed placement should be accepted.",
        inputSchema: z.object({
          notes: z.string(),
          accepted: z.boolean(),
        }),
        execute: async (input) =>
          recordTrace(traces, "audition", input, {
            accepted: input.accepted,
            notes: input.notes,
          }),
      }),
      regenerate: tool({
        description: "Request another pass when audition rejects the placement.",
        inputSchema: z.object({
          reason: z.string(),
        }),
        execute: async (input) =>
          recordTrace(traces, "regenerate", input, {
            retry: true,
            reason: input.reason,
          }),
      }),
    },
  });

  const resolvedPrompt = [
    `User prompt: ${prompt}`,
    `Current slice count: ${sliceCount}`,
    `Current traversal: ${traversal}`,
  ].join("\n");

  await recordPromptMemory({
    action: "tool-loop",
    metadata: { sliceCount, traversal },
    model,
    resolvedPrompt,
    source: "ai.grid-tool-agent",
    systemPrompt: instructions,
    toolSlug: "grid-sampler",
    userPrompt: prompt,
  });

  await agent.generate({
    prompt: resolvedPrompt,
  });

  return traces;
}

function recordTrace<TInput, TResult>(
  traces: GridToolTrace[],
  name: string,
  input: TInput,
  result: TResult,
) {
  traces.push({ name, input, result });
  return result;
}
