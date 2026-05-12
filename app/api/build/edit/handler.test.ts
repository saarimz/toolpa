import { describe, expect, it, vi } from "vitest";

import { handleBuildEditRequest } from "@/app/api/build/edit/handler";
import type { BuilderStreamChunk } from "@/lib/agents/builder-contracts";
import { SandboxBreach } from "@/lib/agents/sandbox";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/build/edit", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function readStream(response: Response): Promise<unknown[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: unknown[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (const line of buffer.split("\n")) {
      if (line.trim().length > 0) {
        chunks.push(JSON.parse(line));
      }
    }
    buffer = "";
  }
  return chunks;
}

describe("handleBuildEditRequest", () => {
  it("rejects malformed JSON shapes", async () => {
    const response = await handleBuildEditRequest(
      makeRequest({ description: "hi" }),
      {},
    );
    expect(response.status).toBe(400);
  });

  it("streams reasoning + breach chunks from the edit agent", async () => {
    const runEditAgent = vi.fn(
      async (input: { onChunk?: (chunk: BuilderStreamChunk) => void }) => {
        input.onChunk?.({ type: "decision", message: "thinking" });
        input.onChunk?.({ type: "reasoning", delta: "considering options" });
        throw new SandboxBreach("path traversal");
      },
    );

    const response = await handleBuildEditRequest(
      makeRequest({ slug: "intelligence-sampler", description: "add a hi-hat" }),
      { runEditAgent },
    );

    expect(response.status).toBe(200);
    const chunks = await readStream(response);
    expect(chunks).toEqual([
      { type: "decision", message: "thinking" },
      { type: "reasoning", delta: "considering options" },
      { type: "breach", message: "path traversal" },
    ]);
    expect(runEditAgent).toHaveBeenCalledOnce();
  });

  it("emits a generic error chunk when the agent throws an unrelated error", async () => {
    const runEditAgent = vi.fn(async () => {
      throw new Error("gateway timed out");
    });
    const response = await handleBuildEditRequest(
      makeRequest({ slug: "intelligence-sampler", description: "rework prompt" }),
      { runEditAgent },
    );
    const chunks = (await readStream(response)) as Array<{ type: string; message: string }>;
    expect(chunks).toEqual([{ type: "error", message: "gateway timed out" }]);
  });
});
