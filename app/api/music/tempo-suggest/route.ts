import { handleTempoSuggestRequest } from "@/app/api/music/tempo-suggest/handler";
import { suggestTempoWithAgent } from "@/lib/music/tempo-agent";

export async function POST(request: Request) {
  return handleTempoSuggestRequest(request, { suggestTempoWithAgent });
}
