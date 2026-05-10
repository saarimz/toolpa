import { handleScaleSearchRequest } from "@/app/api/music/scale-search/handler";
import { chooseScaleWithAgent } from "@/lib/music/scale-agent";

export async function POST(request: Request) {
  return handleScaleSearchRequest(request, { chooseScaleWithAgent });
}
