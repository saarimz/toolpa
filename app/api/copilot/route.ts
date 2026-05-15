import { handleCopilotRequest } from "@/app/api/copilot/handler";
import { isGatewayConfigured } from "@/lib/ai/gateway";
import { generateProducerCopilotReply } from "@/lib/ai/producer-copilot";

export async function POST(request: Request) {
  return handleCopilotRequest(request, {
    generateReply: generateProducerCopilotReply,
    isGatewayConfigured,
  });
}
