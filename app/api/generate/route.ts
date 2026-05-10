import { handleGenerateRequest } from "@/app/api/generate/handler";
import { runGridToolAgent } from "@/lib/ai/grid-tool-agent";
import { streamPattern } from "@/lib/ai/pattern-generation";

export async function POST(request: Request) {
  return handleGenerateRequest(request, { streamPattern, runGridToolAgent });
}
