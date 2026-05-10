import { describe, expect, it } from "vitest";

import { resolveToolPrompts } from "@/lib/agents/dispatch";
import { getAgentManifestsByLevel } from "@/lib/agents/registry";
import { createPattern, createTrack } from "@/lib/pattern/schema";

const pattern = createPattern({
  id: "test-pattern",
  name: "test pattern",
  tracks: [
    createTrack({
      id: "track-1",
      name: "track 1",
      sampleId: "sample-1",
      role: "loop",
    }),
  ],
});

const splicePattern = createPattern({
  id: "splice-pattern",
  name: "splice pattern",
  tracks: [
    createTrack({
      id: "source-a",
      name: "source A: Test Loop",
      sampleId: "sample-1",
      role: "loop",
    }),
    createTrack({
      id: "source-b",
      name: "source B: Second Loop",
      sampleId: "sample-2",
      role: "pad",
    }),
  ],
  metadata: {
    sourceSampleIds: ["sample-1", "sample-2"],
    sourceSampleNames: ["Test Loop", "Second Loop"],
  },
});

const sample = {
  id: "sample-1",
  name: "Test Loop",
  pack: "tests",
  role: "loop" as const,
  estimatedBpm: 140,
  durationSec: 4,
  tags: ["test"],
  analysis: null,
};

describe("resolveToolPrompts", () => {
  it.each([
    ["intelligence-sampler"],
    ["grid-sampler"],
    ["drum-machine"],
    ["splice-lab"],
  ])("returns non-empty prompt text for %s", (toolSlug) => {
    const result = resolveToolPrompts({
      toolSlug,
      pattern: toolSlug === "splice-lab" ? splicePattern : pattern,
      sample,
      secondarySample:
        toolSlug === "splice-lab"
          ? { ...sample, id: "sample-2", name: "Second Loop" }
          : null,
      bpm: 140,
      swing: 0.1,
      musicalContext: {
        bpm: 140,
        swing: 0.1,
        key: { tonic: "F", scaleId: "dorian", referenceFrequency: 440 },
      },
      vibe: "test groove",
      agentMode: "structured",
    });

    expect(result.system.length).toBeGreaterThan(20);
    expect(result.prompt).toContain("test groove");
  });

  it("fails fast when splice-lab does not receive at least two source tracks", () => {
    expect(() =>
      resolveToolPrompts({
        toolSlug: "splice-lab",
        pattern,
        sample,
        secondarySample: null,
        bpm: 140,
        swing: 0.1,
        vibe: "test groove",
        agentMode: "structured",
      }),
    ).toThrow("at least two sources");
  });

  it("does not resolve deleted generated tool prompts", () => {
    expect(() =>
      resolveToolPrompts({
        toolSlug: "vocal-stutter",
        pattern,
        sample,
        secondarySample: null,
        bpm: 140,
        swing: 0.1,
        vibe: "test groove",
        agentMode: "structured",
      }),
    ).toThrow("Unsupported tool vocal-stutter");
  });

  it("resolves prompts for every L1 pattern instrument in the registry", () => {
    const patternToolSlugs = getAgentManifestsByLevel(1)
      .filter((manifest) => manifest.instrument.document === "pattern")
      .map((manifest) => manifest.slug);

    expect(patternToolSlugs.length).toBeGreaterThan(0);

    for (const toolSlug of patternToolSlugs) {
      const result = resolveToolPrompts({
        toolSlug,
        pattern: toolSlug === "splice-lab" ? splicePattern : pattern,
        sample,
        secondarySample:
          toolSlug === "splice-lab"
            ? { ...sample, id: "sample-2", name: "Second Loop" }
            : null,
        bpm: 140,
        swing: 0.1,
        vibe: "registry smoke",
        agentMode: "structured",
      });

      expect(result.system.length, toolSlug).toBeGreaterThan(20);
      expect(result.prompt.length, toolSlug).toBeGreaterThan(20);
    }
  });
});
