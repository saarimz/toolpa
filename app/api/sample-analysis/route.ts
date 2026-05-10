import { handleSampleAnalysisRequest } from "@/app/api/sample-analysis/handler";

export async function POST(request: Request) {
  return handleSampleAnalysisRequest(request);
}
