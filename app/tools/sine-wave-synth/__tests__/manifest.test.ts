import { describe, expect, it } from "vitest";
import { AgentManifestSchema } from "@/lib/agents/contract";
import { sineWaveSynthManifest } from "../manifest";

describe("sineWaveSynthManifest", () => {
  it("matches the shared manifest schema", () => {
    expect(AgentManifestSchema.parse(sineWaveSynthManifest)).toMatchObject({ level: 1 });
  });
});
