import "server-only";

import { Output, streamText } from "ai";

import { getGatewayModel } from "@/lib/ai/gateway";
import { PatternSchema } from "@/lib/pattern/schema";

export type PatternStreamResult = {
  partialOutputStream: AsyncIterable<unknown>;
  output: PromiseLike<unknown>;
};

export type StreamPatternInput = {
  system: string;
  prompt: string;
  model?: string;
};

export async function streamPattern({
  system,
  prompt,
  model,
}: StreamPatternInput): Promise<PatternStreamResult> {
  return streamText({
    model: getGatewayModel(model),
    output: Output.object({ schema: PatternSchema }),
    system,
    prompt,
    temperature: 0.7,
  });
}
