import { describe, expect, it } from "vitest";

import { audioVisualizerManifest } from "@/app/tools/audio-visualizer/manifest";
import { AgentManifestSchema } from "@/lib/agents/contract";

describe("audioVisualizerManifest", () => {
  it("declares the installed visual-scene tool contract", () => {
    expect(AgentManifestSchema.parse(audioVisualizerManifest)).toMatchObject({
      instrument: {
        document: "visual-scene",
        type: "visualizer",
        workflow: "audio-reactive-visual-scene",
      },
      inputs: {
        audioSources: ["live-audio", "audio-file", "microphone"],
      },
      level: 1,
      outputs: {
        visualScene: true,
      },
    });
  });
});
