import { describe, expect, it, vi } from "vitest";

import { handleBuildRequest } from "@/app/api/build/handler";
import type { RunBuilderAgentInput } from "@/app/tools/_builder/lib/builder-agent";

async function readNdjson(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; message?: string });
}

describe("build handler", () => {
  it("streams builder chunks from the L2 runner", async () => {
    const runBuilder = vi.fn(async (input: RunBuilderAgentInput) => {
      input.onChunk?.({ type: "decision", message: "choose skeleton" });
      input.onChunk?.({
        type: "complete",
        manifest: {
          name: "Vocal Stutter",
          slug: "vocal-stutter",
          level: 1,
          origin: "generated",
          description: "Generated",
          route: "/tools/vocal-stutter",
          instrument: {
            type: "sample",
            workflow: "sample-pattern",
            document: "pattern",
            usesSamples: true,
            usesSynthesis: false,
          },
          capabilities: [],
          inputs: {
            samples: [],
            bpm: true,
            globalBpm: true,
            globalKey: false,
            scaleSearch: false,
            prompt: true,
            description: false,
            referenceAgent: false,
            requiredAnalysis: [],
          },
          musicContext: {
            globalBpm: true,
            globalKey: false,
            scaleSearch: false,
          },
          outputs: {
            pattern: true,
            synthScene: false,
            audio: true,
            recording: true,
            files: false,
            manifest: false,
          },
          autonomy: "assist",
          status: "enabled",
        },
        files: ["app/tools/vocal-stutter/manifest.ts"],
        registered: true,
      });
    });

    const response = await handleBuildRequest(
      new Request("http://localhost/api/build", {
        method: "POST",
        body: JSON.stringify({
          description: "a tool that stutters vocal samples",
          slug: "vocal-stutter",
          name: "Vocal Stutter",
          instrumentType: "sample",
        }),
      }),
      { runBuilder },
    );

    expect(response.status).toBe(200);
    expect(runBuilder).toHaveBeenCalledWith(
      expect.objectContaining({
        instrumentType: "sample",
        tokenBudget: 50000,
      }),
    );
    expect((await readNdjson(response)).map((chunk) => chunk.type)).toEqual([
      "decision",
      "complete",
    ]);
  });

  it("rejects malformed build requests", async () => {
    const response = await handleBuildRequest(
      new Request("http://localhost/api/build", {
        method: "POST",
        body: JSON.stringify({ description: "short" }),
      }),
      { runBuilder: vi.fn() },
    );

    expect(response.status).toBe(400);
  });
});
