import { decodeWavInNode } from "@/lib/samples/analysis/pipeline/decode";
import { runEssentiaPipeline } from "@/lib/samples/analysis/essentia/pipeline";
import { SampleAnalysisSchema } from "@/lib/samples/analysis/schema";

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "application/octet-stream",
]);

export type AnalyzeUploadHandlerDeps = {
  decodeWav?: typeof decodeWavInNode;
  runPipeline?: typeof runEssentiaPipeline;
  includeMusicnn?: boolean;
  maxBytes?: number;
};

export async function handleAnalyzeUploadRequest(
  request: Request,
  deps: AnalyzeUploadHandlerDeps = {},
): Promise<Response> {
  const decodeWav = deps.decodeWav ?? decodeWavInNode;
  const runPipeline = deps.runPipeline ?? runEssentiaPipeline;
  const maxBytes = deps.maxBytes ?? MAX_BYTES;

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim()
    ?? "application/octet-stream";
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return Response.json(
      { error: `unsupported content-type: ${contentType}` },
      { status: 415 },
    );
  }

  const sizeHeader = request.headers.get("content-length");
  if (sizeHeader && Number(sizeHeader) > maxBytes) {
    return Response.json({ error: "file too large" }, { status: 413 });
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await request.arrayBuffer();
  } catch {
    return Response.json({ error: "failed to read body" }, { status: 400 });
  }

  if (arrayBuffer.byteLength > maxBytes) {
    return Response.json({ error: "file too large" }, { status: 413 });
  }
  if (arrayBuffer.byteLength === 0) {
    return Response.json({ error: "empty body" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = decodeWav(arrayBuffer);
  } catch (error) {
    return Response.json(
      {
        error: "could not decode audio",
        message: error instanceof Error ? error.message : "decode failed",
      },
      { status: 415 },
    );
  }

  try {
    const analysis = await runPipeline({
      arrayBuffer,
      channels: decoded.channels,
      sampleRate: decoded.sampleRate,
      durationSec: decoded.durationSec,
      includeMusicnn: deps.includeMusicnn ?? false,
    });
    const validated = SampleAnalysisSchema.parse(analysis);
    return Response.json({ analysis: validated });
  } catch (error) {
    return Response.json(
      {
        error: "analysis failed",
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
