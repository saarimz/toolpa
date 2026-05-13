import { describe, expect, it } from "vitest";

import { AgentManifestSchema } from "@/lib/agents/contract";
import { sampleAnalysisManifest } from "@/app/tools/sample-analysis/manifest";

describe("sample analysis manifest", () => {
  it("matches the shared L1 agent manifest contract", () => {
    expect(AgentManifestSchema.parse(sampleAnalysisManifest)).toMatchObject({
      slug: "sample-analysis",
      level: 1,
      instrument: {
        document: "audio-stream",
        type: "sample",
      },
      outputs: {
        audio: true,
        recording: true,
      },
      status: "enabled",
    });
  });
});
