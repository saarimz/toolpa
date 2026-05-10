import { describe, expect, it } from "vitest";

import { AgentManifestSchema } from "@/lib/agents/contract";
import { evolvingFmSynthManifest } from "../manifest";

describe("evolving fm synth manifest", () => {
  it("matches the shared L1 agent manifest contract", () => {
    expect(AgentManifestSchema.parse(evolvingFmSynthManifest)).toMatchObject({
      slug: "evolving-fm-synth",
      level: 1,
      autonomy: "driven",
      status: "enabled",
    });
  });
});
