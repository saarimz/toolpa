import { handleGenerateSynthSceneRequest } from "@/app/api/synth/handler";
import { generateSynthSceneWithGateway } from "@/lib/ai/synth-generation";

export async function POST(request: Request) {
  return handleGenerateSynthSceneRequest(request, { generateSynthSceneWithGateway });
}
