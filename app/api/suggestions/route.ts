import { handleSuggestionsRequest } from "@/app/api/suggestions/handler";
import { generatePromptSuggestions } from "@/lib/ai/prompt-suggestions";

export async function POST(request: Request) {
  return handleSuggestionsRequest(request, { generatePromptSuggestions });
}
