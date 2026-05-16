import { describe, expect, it } from "vitest";
import { AgentManifestSchema } from "@/lib/agents/contract";
import { samplePatternCalled20260516t164714563z45502e89Manifest } from "../manifest";

describe("samplePatternCalled20260516t164714563z45502e89Manifest", () => {
  it("matches the shared manifest schema", () => {
    expect(AgentManifestSchema.parse(samplePatternCalled20260516t164714563z45502e89Manifest)).toMatchObject({ level: 1 });
  });
});
