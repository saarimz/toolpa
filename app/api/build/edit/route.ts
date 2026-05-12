import { handleBuildEditRequest } from "@/app/api/build/edit/handler";

export async function POST(request: Request) {
  return handleBuildEditRequest(request);
}
