import { describe, expect, it } from "vitest";

import { readGenerateStream } from "@/lib/ai/client-stream";

describe("client generate stream", () => {
  it("parses newline-delimited chunks", async () => {
    const chunks: unknown[] = [];
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({ type: "prompt", prompt: "a", system: "b" })}\n`,
          ),
        );
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({ type: "final", pattern: { id: "p" } })}\n`,
          ),
        );
        controller.close();
      },
    });

    await readGenerateStream(new Response(body), (chunk) => chunks.push(chunk));

    expect(chunks).toEqual([
      { type: "prompt", prompt: "a", system: "b" },
      { type: "final", pattern: { id: "p" } },
    ]);
  });

  it("rejects failed responses", async () => {
    await expect(
      readGenerateStream(new Response(null, { status: 500 }), () => undefined),
    ).rejects.toThrow("Generation failed");
  });
});
