import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getAgentManifest,
  getAgentManifests,
  getAgentManifestsByLevel,
  getEnabledAgentManifests,
} from "@/lib/agents/registry";
import { readInTreeAgentManifests } from "@/lib/agents/manifest-source";

describe("agent registry", () => {
  it("returns a deterministic slug-sorted registry", () => {
    const slugs = getAgentManifests().map((manifest) => manifest.slug);
    expect(slugs).toEqual([...slugs].sort());
    expect(slugs).toEqual(
      expect.arrayContaining([
        "intelligence-sampler",
        "drum-machine",
        "evolving-fm-synth",
        "grid-sampler",
        "splice-lab",
      ]),
    );
  });

  it("covers every in-tree tool manifest", () => {
    const toolDirectories = readdirSync(join(process.cwd(), "app", "tools"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const registeredSlugs = new Set(getAgentManifests().map((manifest) => manifest.slug));

    for (const slug of toolDirectories) {
      expect(registeredSlugs.has(slug), `${slug} manifest missing from registry`).toBe(
        true,
      );
    }
  });

  it("auto-discovers in-tree manifests from app/tools", () => {
    const discoveredSlugs = readInTreeAgentManifests()
      .map((manifest) => manifest.slug)
      .sort();

    expect(discoveredSlugs).toEqual(
      expect.arrayContaining([
        "_builder",
        "intelligence-sampler",
        "drum-machine",
        "evolving-fm-synth",
        "grid-sampler",
        "splice-lab",
      ]),
    );
  });

  it("exposes only enabled tools separately", () => {
    expect(getEnabledAgentManifests().map((manifest) => manifest.slug)).toEqual(
      expect.arrayContaining([
        "intelligence-sampler",
        "drum-machine",
        "evolving-fm-synth",
        "grid-sampler",
        "splice-lab",
      ]),
    );
  });

  it("finds manifests by slug", () => {
    expect(getAgentManifest("intelligence-sampler")?.route).toBe("/tools/intelligence-sampler");
    expect(getAgentManifest("missing")).toBeNull();
  });

  it("tags shipped tools as installed and excludes generated tools", () => {
    expect(getAgentManifest("intelligence-sampler")?.origin).toBe("installed");
    expect(getAgentManifest("drum-machine")?.origin).toBe("installed");
    expect(getAgentManifest("evolving-fm-synth")?.origin).toBe("installed");
    expect(getAgentManifest("grid-sampler")?.origin).toBe("installed");
    expect(getAgentManifest("splice-lab")?.origin).toBe("installed");
    expect(getAgentManifest("vocal-stutter")).toBeNull();
    expect(getAgentManifest("l2-grid-sampler")).toBeNull();
    expect(getAgentManifest("l2-drum-machine")).toBeNull();
    expect(getAgentManifests().filter((manifest) => manifest.origin === "generated")).toEqual([]);
  });

  it("exposes instrument workflow tags for sample tools, synth tools, and builders", () => {
    expect(getAgentManifest("intelligence-sampler")?.instrument).toMatchObject({
      type: "sample",
      document: "pattern",
      usesSamples: true,
      usesSynthesis: false,
    });
    expect(getAgentManifest("intelligence-sampler")?.musicContext).toMatchObject({
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
    });
    expect(getAgentManifest("evolving-fm-synth")?.instrument).toMatchObject({
      type: "synth",
      document: "synth-scene",
      usesSamples: false,
      usesSynthesis: true,
    });
    expect(getAgentManifest("evolving-fm-synth")?.outputs).toMatchObject({
      pattern: false,
      synthScene: true,
    });
    expect(getAgentManifest("_builder")?.instrument).toMatchObject({
      type: "builder",
      document: "files",
    });
  });

  it("filters manifests by level", () => {
    expect(getAgentManifestsByLevel(1).map((manifest) => manifest.slug)).toEqual(
      expect.arrayContaining(["intelligence-sampler", "evolving-fm-synth", "grid-sampler"]),
    );
    expect(getAgentManifestsByLevel(2).every((manifest) => manifest.level === 2)).toBe(
      true,
    );
  });
});
