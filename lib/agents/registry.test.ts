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
        "_effect-builder",
        "_hybrid-builder",
        "_microtonal-builder",
        "_sample-builder",
        "_synth-builder",
        "intelligence-sampler",
        "drum-machine",
        "evolving-fm-synth",
        "grid-sampler",
        "midi-generator",
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
        "_effect-builder",
        "_hybrid-builder",
        "_microtonal-builder",
        "_sample-builder",
        "_synth-builder",
        "_builder",
        "intelligence-sampler",
        "drum-machine",
        "evolving-fm-synth",
        "grid-sampler",
        "midi-generator",
        "splice-lab",
      ]),
    );
  });

  it("exposes only enabled tools separately", () => {
    expect(getEnabledAgentManifests().map((manifest) => manifest.slug)).toEqual(
      expect.arrayContaining([
        "_effect-builder",
        "_hybrid-builder",
        "_microtonal-builder",
        "_sample-builder",
        "_synth-builder",
        "intelligence-sampler",
        "drum-machine",
        "evolving-fm-synth",
        "grid-sampler",
        "midi-generator",
        "splice-lab",
      ]),
    );
  });

  it("finds manifests by slug", () => {
    expect(getAgentManifest("intelligence-sampler")?.route).toBe("/tools/intelligence-sampler");
    expect(getAgentManifest("missing")).toBeNull();
  });

  it("tags shipped tools as installed and keeps generated tools distinct", () => {
    expect(getAgentManifest("intelligence-sampler")?.origin).toBe("installed");
    expect(getAgentManifest("drum-machine")?.origin).toBe("installed");
    expect(getAgentManifest("evolving-fm-synth")?.origin).toBe("installed");
    expect(getAgentManifest("grid-sampler")?.origin).toBe("installed");
    expect(getAgentManifest("midi-generator")?.origin).toBe("installed");
    expect(getAgentManifest("splice-lab")?.origin).toBe("installed");
    const installedSlugs = new Set([
      "intelligence-sampler",
      "drum-machine",
      "evolving-fm-synth",
      "grid-sampler",
      "midi-generator",
      "splice-lab",
    ]);
    const generatedManifests = getAgentManifests().filter(
      (manifest) => manifest.origin === "generated",
    );

    expect(
      generatedManifests.every((manifest) => !installedSlugs.has(manifest.slug)),
    ).toBe(true);
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
    expect(getAgentManifest("midi-generator")?.instrument).toMatchObject({
      type: "midi",
      document: "midi-clip",
      usesSamples: false,
      usesSynthesis: true,
    });
    expect(getAgentManifest("midi-generator")?.outputs).toMatchObject({
      midi: true,
      audio: true,
    });
    expect(getAgentManifest("_builder")?.instrument).toMatchObject({
      type: "builder",
      document: "files",
    });
    expect(getAgentManifest("_synth-builder")).toMatchObject({
      level: 2,
      route: "/build/synth",
      instrument: {
        type: "builder",
        document: "files",
        workflow: "synth-l2-builder",
      },
    });
  });

  it("filters manifests by level", () => {
    expect(getAgentManifestsByLevel(1).map((manifest) => manifest.slug)).toEqual(
      expect.arrayContaining([
        "intelligence-sampler",
        "evolving-fm-synth",
        "grid-sampler",
        "midi-generator",
      ]),
    );
    expect(getAgentManifestsByLevel(2).every((manifest) => manifest.level === 2)).toBe(
      true,
    );
    expect(getAgentManifestsByLevel(2).map((manifest) => manifest.slug)).toEqual(
      expect.arrayContaining([
        "_builder",
        "_effect-builder",
        "_hybrid-builder",
        "_microtonal-builder",
        "_sample-builder",
        "_synth-builder",
      ]),
    );
    expect(getAgentManifests().some((manifest) => manifest.level > 2)).toBe(false);
  });
});
