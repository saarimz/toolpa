import { handleBuildRequest } from "@/app/api/build/handler";

export async function POST(request: Request) {
  return handleBuildRequest(request);
}
