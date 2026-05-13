import { describe, expect, it } from "vitest";

import { midiGeneratorManifest } from "@/app/tools/midi-generator/manifest";
import { AgentManifestSchema } from "@/lib/agents/contract";

describe("midi generator manifest", () => {
  it("registers MIDI Generator as an installed L1 MIDI clip instrument", () => {
    expect(AgentManifestSchema.parse(midiGeneratorManifest)).toMatchObject({
      name: "MIDI Generator",
      slug: "midi-generator",
      level: 1,
      origin: "installed",
      instrument: {
        document: "midi-clip",
        type: "midi",
      },
      musicContext: {
        globalBpm: true,
        globalKey: true,
        scaleSearch: true,
      },
      outputs: {
        audio: true,
        midi: true,
        recording: true,
      },
      route: "/tools/midi-generator",
      status: "enabled",
    });
  });
});
