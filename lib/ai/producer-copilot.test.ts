import { describe, expect, it } from "vitest";

import { buildProducerCopilotSystem } from "@/lib/ai/producer-copilot";
import type { AgentManifest } from "@/lib/agents/contract";

const tool = {
  name: "MIDI Generator",
  slug: "midi-generator",
  level: 1,
  origin: "installed",
  description: "Prompt expressive MIDI clips and export the MIDI anywhere.",
  route: "/tools/midi-generator",
  instrument: {
    type: "midi",
    workflow: "midi-generator",
    document: "midi-clip",
    usesSamples: false,
    usesSynthesis: true,
  },
  capabilities: ["generateMidi", "exportMidi"],
  inputs: {
    samples: [],
    bpm: true,
    globalBpm: true,
    globalKey: true,
    scaleSearch: true,
    prompt: true,
    description: false,
    referenceAgent: false,
    requiredAnalysis: [],
  },
  musicContext: {
    globalBpm: true,
    globalKey: true,
    scaleSearch: true,
  },
  outputs: {
    pattern: false,
    synthScene: false,
    midi: true,
    audio: true,
    recording: true,
    files: false,
    manifest: false,
  },
  autonomy: "assist",
  status: "enabled",
} satisfies AgentManifest;

describe("producer copilot prompt", () => {
  it("grounds the copilot in music production and installed tools", () => {
    const system = buildProducerCopilotSystem([tool]);

    expect(system).toContain("Little Toolpa");
    expect(system).toContain("music producer copilot");
    expect(system).toContain("arrangement, drums, sampling, synthesis, MIDI");
    expect(system).toContain("MIDI Generator (/tools/midi-generator)");
    expect(system).toContain("Do not invent tools");
  });
});
