import { describe, expect, it } from "vitest";
import { AgentManifestSchema } from "@/lib/agents/contract";
import { harmonicDistrotionEffectManifest } from "../manifest";

describe("harmonicDistrotionEffectManifest", () => {
  it("matches the shared manifest schema", () => {
    expect(AgentManifestSchema.parse(harmonicDistrotionEffectManifest)).toMatchObject({ level: 1 });
  });
});
