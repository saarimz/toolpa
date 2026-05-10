import { describe, expect, it } from "vitest";

import { AgentManifestSchema } from "@/lib/agents/contract";
import { instantiateToolSkeleton } from "@/lib/agents/templates/instantiate";

describe("instantiateToolSkeleton", () => {
  it("renders a complete L1 tool skeleton under the tool root", () => {
    const instance = instantiateToolSkeleton({
      slug: "vocal-stutter",
      name: "Vocal Stutter",
      description: "Turns a vocal sample into a chopped stutter instrument.",
      capabilities: ["generatePattern", "uploadSample"],
      sampleRoles: ["oneshot", "loop"],
    });

    expect(AgentManifestSchema.parse(instance.manifest)).toMatchObject({
      slug: "vocal-stutter",
      level: 1,
      origin: "generated",
      instrument: {
        type: "sample",
        workflow: "sample-pattern",
        document: "pattern",
        usesSamples: true,
        usesSynthesis: false,
      },
      outputs: { pattern: true, synthScene: false, audio: true, recording: true },
      musicContext: { globalBpm: true, globalKey: true, scaleSearch: true },
    });
    expect([...instance.files.keys()]).toEqual([
      "app/tools/vocal-stutter/manifest.ts",
      "app/tools/vocal-stutter/page.tsx",
      "app/tools/vocal-stutter/client.tsx",
      "app/tools/vocal-stutter/lib/prompt.ts",
      "app/tools/vocal-stutter/__tests__/manifest.test.ts",
      "app/tools/vocal-stutter/client.test.tsx",
      "app/tools/vocal-stutter/lib/prompt.test.ts",
    ]);
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "SamplePicker",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "playIntelligenceSamplerPattern",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "PatternLiveTrace",
    );
    expect(
      [...instance.files.values()].every((content) => !/\{\{[a-zA-Z]/.test(content)),
    ).toBe(true);
  });

  it("rejects invalid generated slugs through the shared manifest schema", () => {
    expect(() =>
      instantiateToolSkeleton({
        slug: "../escape",
        name: "Bad",
        description: "Bad",
      }),
    ).toThrow();
  });

  it("rejects unsupported synth skeleton requests explicitly", () => {
    expect(() =>
      instantiateToolSkeleton({
        slug: "simple-synth",
        name: "Simple Synth",
        description: "A prompt-driven synth instrument.",
        instrumentType: "synth",
      }),
    ).toThrow(/sample instruments only/);
  });
});
