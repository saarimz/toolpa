import { describe, expect, it } from "vitest";

import {
  createLocalSplicePattern,
} from "@/app/tools/splice-lab/lib/local-agent";
import {
  createSpliceLabState,
  spliceLabToPattern,
} from "@/app/tools/splice-lab/lib/pattern";
import { PatternSchema } from "@/lib/pattern/schema";

describe("createLocalSplicePattern", () => {
  it("builds a valid deterministic multi-source choke map", () => {
    const seed = spliceLabToPattern(
      createSpliceLabState({
        sources: [
          { sampleId: "library:jungle/let-there-break", name: "break", role: "break" },
          { sampleId: "library:tones/warm-pad", name: "pad", role: "pad" },
        ],
      }),
    );

    const pattern = createLocalSplicePattern({
      pattern: seed,
      prompt: "call and response source swaps with a few tape drifts",
      sliceCount: 16,
    });

    expect(PatternSchema.safeParse(pattern).success).toBe(true);
    expect(pattern.tracks).toHaveLength(2);
    expect(pattern.metadata).toMatchObject({
      createdBy: "ai",
      toolSlug: "splice-lab",
    });
    expect(pattern.metadata.rationale).toContain("Local splice fallback");
    expect(pattern.tracks.every((track) => track.chokeGroup === "splice-switch")).toBe(
      true,
    );

    for (let stepIndex = 0; stepIndex < 16; stepIndex += 1) {
      const activeSources = pattern.tracks.filter(
        (track) => track.steps[stepIndex]?.active,
      );
      expect(activeSources).toHaveLength(1);
    }
  });
});
