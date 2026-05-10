import type { GenerateStreamChunk } from "@/lib/ai/contracts";

export async function readGenerateStream(
  response: Response,
  onChunk: (chunk: GenerateStreamChunk) => void,
) {
  return readNdjsonStream<GenerateStreamChunk>(response, onChunk, "Generation");
}

export async function readNdjsonStream<TChunk>(
  response: Response,
  onChunk: (chunk: TChunk) => void,
  label = "Stream",
) {
  if (!response.ok || !response.body) {
    throw new Error(`${label} failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        onChunk(JSON.parse(line) as TChunk);
      }
    }
  }
}
