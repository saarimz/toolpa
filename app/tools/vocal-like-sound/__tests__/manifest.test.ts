import { describe, expect, it } from "vitest";
import { AgentManifestSchema } from "@/lib/agents/contract";
import { vocalLikeSoundManifest } from "../manifest";

describe("vocalLikeSoundManifest", () => {
  it("matches the shared manifest schema", () => {
    expect(AgentManifestSchema.parse(vocalLikeSoundManifest)).toMatchObject({ level: 1 });
  });
});
