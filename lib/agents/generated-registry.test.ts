import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  readGeneratedAgentManifests,
  writeGeneratedAgentManifest,
} from "@/lib/agents/generated-registry";

describe("generated agent registry", () => {
  it("returns an empty list when no generated registry exists", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-registry-")), "missing.json");

    expect(readGeneratedAgentManifests(path)).toEqual([]);
  });

  it("upserts and slug-sorts generated manifests", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agent-registry-")), "tools.json");

    writeGeneratedAgentManifest({
      path,
      manifest: {
        name: "Z Tool",
        slug: "z-tool",
        level: 1,
        description: "Generated Z",
        route: "/tools/z-tool",
        outputs: { pattern: true, synthScene: false, audio: true, files: false, manifest: false },
      },
    });
    const manifests = writeGeneratedAgentManifest({
      path,
      manifest: {
        name: "A Tool",
        slug: "a-tool",
        level: 1,
        description: "Generated A",
        route: "/tools/a-tool",
        outputs: { pattern: true, synthScene: false, audio: true, files: false, manifest: false },
      },
    });

    expect(manifests.map((manifest) => manifest.slug)).toEqual(["a-tool", "z-tool"]);
    expect(manifests.every((manifest) => manifest.origin === "generated")).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
      manifests: [
        { slug: "a-tool", origin: "generated" },
        { slug: "z-tool", origin: "generated" },
      ],
    });
  });
});
