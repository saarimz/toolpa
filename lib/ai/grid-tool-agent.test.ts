import { describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({
  generatedSettings: [] as Array<{
    tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
  }>,
}));

vi.mock("@/lib/ai/gateway", () => ({
  getGatewayModel: vi.fn((model?: string) => model ?? "model"),
}));
vi.mock("server-only", () => ({}));

vi.mock("ai", () => {
  class ToolLoopAgent {
    settings: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    };

    constructor(settings: ToolLoopAgent["settings"]) {
      this.settings = settings;
      aiMocks.generatedSettings.push(settings);
    }

    async generate() {
      await this.settings.tools.chop?.execute({ requestedSlices: 64 });
      await this.settings.tools.place?.execute({
        traversal: "Diagonal",
        density: "dense",
      });
      await this.settings.tools.audition?.execute({
        notes: "works",
        accepted: true,
      });
    }
  }

  return {
    ToolLoopAgent,
    stepCountIs: vi.fn((count: number) => ({ count })),
    tool: vi.fn((definition) => definition),
  };
});

describe("grid tool agent", () => {
  it("records tool traces from the AI SDK tool loop", async () => {
    const { runGridToolAgent } = await import("@/lib/ai/grid-tool-agent");

    await expect(
      runGridToolAgent({
        prompt: "diagonal stutters",
        sliceCount: 64,
        traversal: "Diagonal",
      }),
    ).resolves.toEqual([
      {
        name: "chop",
        input: { requestedSlices: 64 },
        result: { sliceCount: 64, accepted: true },
      },
      {
        name: "place",
        input: { traversal: "Diagonal", density: "dense" },
        result: {
          traversal: "Diagonal",
          density: "dense",
          prompt: "diagonal stutters",
        },
      },
      {
        name: "audition",
        input: { notes: "works", accepted: true },
        result: { accepted: true, notes: "works" },
      },
    ]);
    expect(aiMocks.generatedSettings).toHaveLength(1);
  });
});
