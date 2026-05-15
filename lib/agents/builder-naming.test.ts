import { describe, expect, it } from "vitest";

import {
  createGeneratedToolIdentity,
  deriveGeneratedToolName,
  formatGeneratedToolTimestamp,
  slugifyToolName,
} from "@/lib/agents/builder-naming";

describe("builder naming", () => {
  it("derives compact names and slugs from tool descriptions", () => {
    expect(deriveGeneratedToolName("a granular pad freezer with reverse trails")).toBe(
      "Granular Pad Freezer",
    );
    expect(slugifyToolName("Granular Pad Freezer")).toBe(
      "granular-pad-freezer",
    );
  });

  it("creates timestamped generated tool identities", () => {
    const identity = createGeneratedToolIdentity({
      description: "a granular pad freezer with reverse trails",
      now: new Date("2026-05-15T18:40:56.247Z"),
      randomSuffix: "ABC-123-EF",
    });

    expect(identity).toMatchObject({
      baseName: "Granular Pad Freezer",
      id: "20260515t184056247z-abc123ef",
      name: "Granular Pad Freezer 20260515T184056247Z-abc123ef",
      slug: "granular-pad-freezer-20260515t184056247z-abc123ef",
      timestamp: "20260515T184056247Z",
    });
  });

  it("keeps explicit name and slug bases while preserving the unique suffix", () => {
    const identity = createGeneratedToolIdentity({
      description: "ignored once explicit name and slug exist",
      name: "Custom Delay Effect",
      now: new Date("2026-05-15T18:40:56.247Z"),
      randomSuffix: "short",
      slug: "custom-delay-effect",
    });

    expect(identity.name).toBe(
      "Custom Delay Effect 20260515T184056247Z-short000",
    );
    expect(identity.slug).toBe(
      "custom-delay-effect-20260515t184056247z-short000",
    );
  });

  it("formats invalid timestamps deterministically", () => {
    expect(formatGeneratedToolTimestamp(new Date(Number.NaN))).toBe(
      "19700101T000000000Z",
    );
  });
});
