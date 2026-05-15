import { handlePromptMemoryRequest } from "@/app/api/prompt-memory/handler";

export async function POST(request: Request) {
  return handlePromptMemoryRequest(request);
}
