import { describe, expect, it } from "vitest";

import { timeStretchManifest } from "@/app/tools/time-stretch/manifest";
import { AgentManifestSchema } from "@/lib/agents/contract";

describe("time stretch manifest", () => {
  it("matches the shared installed L1 audio-stream contract", () => {
    expect(AgentManifestSchema.parse(timeStretchManifest)).toMatchObject({
      level: 1,
      origin: "installed",
      slug: "time-stretch",
      instrument: {
        document: "audio-stream",
        type: "hybrid",
        usesSamples: true,
        usesSynthesis: true,
      },
      outputs: {
        audio: true,
        files: true,
        recording: true,
      },
      status: "enabled",
    });
  });
});
