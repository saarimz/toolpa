import { handleAnalyzeUploadRequest } from "@/app/api/analyze-upload/handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleAnalyzeUploadRequest(request);
}
