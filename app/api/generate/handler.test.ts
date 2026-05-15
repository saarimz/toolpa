import { describe, expect, it, vi } from "vitest";

import { handleGenerateRequest } from "@/app/api/generate/handler";
import { createDefaultDrumPattern } from "@/app/tools/drum-machine/lib/polyrhythm";
import { createIntelligenceSamplerPattern } from "@/lib/pattern/defaults";
import {
  createSpliceLabState,
  spliceLabToPattern,
} from "@/app/tools/splice-lab/lib/pattern";

async function readNdjson(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; pattern?: unknown });
}

describe("generate handler", () => {
  it("streams prompt, partial pattern, and final pattern", async () => {
    const pattern = createIntelligenceSamplerPattern(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    const streamPattern = vi.fn().mockResolvedValue({
      partialOutputStream: (async function* () {
        yield { metadata: { rationale: "place snares on anchors" } };
      })(),
      output: Promise.resolve(pattern),
    });

    const response = await handleGenerateRequest(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          toolSlug: "intelligence-sampler",
          mode: "fresh",
          prompt: "skittery",
          context: {
            pattern,
            sampleId: "library:jungle/let-there-break",
            bpm: 160,
            swing: 0.1,
          },
        }),
      }),
      { streamPattern },
    );

    expect(response.status).toBe(200);
    const chunks = await readNdjson(response);
    expect(chunks.map((chunk) => chunk.type)).toEqual(["prompt", "partial", "final"]);
    expect(streamPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("skittery"),
      }),
    );
  });

  it("streams transparent tool calls for grid agent mode", async () => {
    const pattern = createIntelligenceSamplerPattern(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    const streamPattern = vi.fn().mockResolvedValue({
      partialOutputStream: (async function* () {})(),
      output: Promise.resolve(pattern),
    });
    const runGridToolAgent = vi.fn().mockResolvedValue([
      { name: "chop", input: { requestedSlices: 64 }, result: { sliceCount: 64 } },
      { name: "place", input: { traversal: "Diagonal" }, result: { traversal: "Diagonal" } },
      { name: "audition", input: { accepted: true }, result: { accepted: true } },
    ]);

    const response = await handleGenerateRequest(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          toolSlug: "grid-sampler",
          agentMode: "tool-calling",
          prompt: "diagonal",
          context: {
            pattern,
            sampleId: "library:jungle/let-there-break",
            bpm: 160,
            sliceCount: 64,
            traversal: "Diagonal",
          },
        }),
      }),
      { streamPattern, runGridToolAgent },
    );

    expect(response.status).toBe(200);
    const chunks = await readNdjson(response);
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "prompt",
      "tool-call",
      "tool-call",
      "tool-call",
      "final",
    ]);
    expect(runGridToolAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "diagonal",
        sliceCount: 64,
        traversal: "Diagonal",
      }),
    );
  });

  it("builds prompts for uploaded browser-local samples", async () => {
    const pattern = createIntelligenceSamplerPattern(
      "upload:user-pad-3-99",
      "user pad.wav",
      "unknown",
    );
    const streamPattern = vi.fn().mockResolvedValue({
      partialOutputStream: (async function* () {})(),
      output: Promise.resolve(pattern),
    });

    const response = await handleGenerateRequest(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          toolSlug: "intelligence-sampler",
          prompt: "slice this like a pad",
          context: {
            pattern,
            sampleId: "upload:user-pad-3-99",
            sampleName: "user pad.wav",
            sampleRole: "unknown",
            bpm: 120,
            swing: 0,
          },
        }),
      }),
      { streamPattern },
    );

    expect(response.status).toBe(200);
    await readNdjson(response);
    expect(streamPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("user pad.wav (Browser upload, unknown)"),
      }),
    );
  });

  it("streams splice-lab prompts with loaded source context", async () => {
    const pattern = spliceLabToPattern(
      createSpliceLabState({
        sourceAId: "upload:user-loop",
        sourceAName: "user loop.wav",
        sourceBId: "library:zero-g/glasychord",
        sourceBName: "Glasychord",
        sourceBRole: "pad",
      }),
    );
    const streamPattern = vi.fn().mockResolvedValue({
      partialOutputStream: (async function* () {})(),
      output: Promise.resolve(pattern),
    });

    const response = await handleGenerateRequest(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          toolSlug: "splice-lab",
          mode: "splice",
          prompt: "make a melodic interlock",
          context: {
            pattern,
            sampleId: "upload:user-loop",
            sampleName: "user loop.wav",
            sampleRole: "unknown",
            secondarySampleId: "library:zero-g/glasychord",
            secondarySampleName: "Glasychord",
            secondarySampleRole: "pad",
            bpm: 132,
            swing: 0.08,
            sliceCount: 16,
          },
        }),
      }),
      { streamPattern },
    );

    expect(response.status).toBe(200);
    await readNdjson(response);
    expect(streamPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("B: Glasychord"),
      }),
    );
  });

  it("passes drum-machine multi-sample lane context into the prompt", async () => {
    const pattern = createDefaultDrumPattern(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    const streamPattern = vi.fn().mockResolvedValue({
      partialOutputStream: (async function* () {})(),
      output: Promise.resolve(pattern),
    });

    const response = await handleGenerateRequest(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          toolSlug: "drum-machine",
          mode: "polyrhythm",
          prompt: "bossa nova with separate drum hits",
          context: {
            pattern,
            sampleId: "library:jungle/let-there-break",
            sampleName: "Let There Break",
            sampleRole: "break",
            sampleMode: "multi",
            trackSamples: [
              {
                sampleId: "library:test/kick",
                sampleName: "Kick",
                sampleRole: "oneshot",
                trackId: "kick",
                trackName: "kick",
              },
            ],
            bpm: 132,
            swing: 0.18,
          },
        }),
      }),
      { streamPattern },
    );

    expect(response.status).toBe(200);
    await readNdjson(response);
    expect(streamPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("sample mode: multi"),
      }),
    );
    expect(streamPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("kick / Kick / oneshot / library:test/kick"),
      }),
    );
  });

  it("rejects unknown tools", async () => {
    const response = await handleGenerateRequest(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          toolSlug: "missing-tool",
          context: {
            pattern: {},
            sampleId: "library:jungle/let-there-break",
            bpm: 160,
          },
        }),
      }),
      {
        streamPattern: vi.fn(),
      },
    );

    expect(response.status).toBe(404);
  });
});
