import { describe, expect, it } from "vitest";
import { AgentManifestSchema } from "@/lib/agents/contract";
import { vocalSampleStutters20260516t194056756z7d9574dfManifest } from "../manifest";

describe("vocalSampleStutters20260516t194056756z7d9574dfManifest", () => {
  it("matches the shared manifest schema", () => {
    expect(AgentManifestSchema.parse(vocalSampleStutters20260516t194056756z7d9574dfManifest)).toMatchObject({ level: 1 });
  });
});
