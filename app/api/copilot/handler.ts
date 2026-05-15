import { z } from "zod";

import type { ProducerCopilotMessage } from "@/lib/ai/producer-copilot";
import { getAgentManifests } from "@/lib/agents/registry";

const CopilotChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["assistant", "user"]),
        content: z.string().trim().min(1).max(2400),
      }),
    )
    .min(1)
    .max(24),
});

export type CopilotHandlerDeps = {
  generateReply: (input: {
    messages: ProducerCopilotMessage[];
    tools: ReturnType<typeof getAgentManifests>;
  }) => Promise<string>;
  isGatewayConfigured: () => boolean;
};

export async function handleCopilotRequest(
  request: Request,
  deps: CopilotHandlerDeps,
): Promise<Response> {
  const parsed = CopilotChatRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid copilot request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (!deps.isGatewayConfigured()) {
    return Response.json(
      {
        error:
          "AI Gateway is not configured. Add AI_GATEWAY_API_KEY to use Little Toolpa.",
      },
      { status: 503 },
    );
  }

  const reply = await deps.generateReply({
    messages: parsed.data.messages,
    tools: getAgentManifests(),
  });

  return Response.json(
    { message: { role: "assistant", content: reply } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
