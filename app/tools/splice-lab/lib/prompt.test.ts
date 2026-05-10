import { describe, expect, it } from "vitest";

import {
  buildSpliceLabPrompt,
  buildSpliceLabSystemPrompt,
} from "@/app/tools/splice-lab/lib/prompt";
import { createSpliceLabState, spliceLabToPattern } from "@/app/tools/splice-lab/lib/pattern";

describe("splice lab prompt", () => {
  it("describes multi-source switching and visible rationale", () => {
    expect(buildSpliceLabSystemPrompt()).toContain("source-a through source-j");
    expect(buildSpliceLabSystemPrompt()).toContain("metadata.rationale");
  });

  it("includes loaded source tracks and slot bounds", () => {
    const state = createSpliceLabState({
      sources: [
        { sampleId: "upload:user-loop", name: "user loop.wav", role: "unknown" },
        { sampleId: "library:zero-g/glasychord", name: "Glasychord", role: "pad" },
        { sampleId: "library:element-one/fx-glitch-01", name: "Glitch", role: "fx" },
      ],
    });
    const prompt = buildSpliceLabPrompt({
      pattern: spliceLabToPattern(state),
      vibe: "melodic interlock",
      sliceCount: 16,
    });

    expect(prompt).toContain("user loop.wav");
    expect(prompt).toContain("Glasychord");
    expect(prompt).toContain("valid slots are 0 through sliceCount - 1");
    expect(prompt).toContain("source-a");
    expect(prompt).toContain("source-b");
    expect(prompt).toContain("source-c");
  });
});
