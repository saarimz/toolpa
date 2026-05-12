import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { drumMachineManifest } from "@/app/tools/drum-machine/manifest";
import { gridSamplerManifest } from "@/app/tools/grid-sampler/manifest";
import { intelligenceSamplerManifest } from "@/app/tools/intelligence-sampler/manifest";
import { spliceLabManifest } from "@/app/tools/splice-lab/manifest";
import { createToolSkeleton } from "@/lib/agents/templates/tool-skeleton/files";

const installedSampleTools = [
  {
    files: ["components/transport-bar.tsx", "components/waveform-slicer.tsx"],
    manifest: intelligenceSamplerManifest,
  },
  {
    files: ["components/transport-bar.tsx", "components/grid-canvas.tsx"],
    manifest: gridSamplerManifest,
  },
  {
    files: ["components/transport-bar.tsx"],
    manifest: drumMachineManifest,
  },
  {
    files: ["components/transport-bar.tsx"],
    manifest: spliceLabManifest,
  },
];

describe("sample tool playback contract", () => {
  it.each(installedSampleTools)(
    "$manifest.slug uses its own isolated playback engine and the shared declick render",
    ({ files, manifest }) => {
      expect(manifest.instrument).toMatchObject({
        document: "pattern",
        type: "sample",
        usesSamples: true,
      });

      const source = files
        .map((file) =>
          readFileSync(join(process.cwd(), "app/tools", manifest.slug, file), "utf8"),
        )
        .join("\n");

      expect(source).toContain("getSamplePlaybackHost");
      expect(source).toContain(`getSamplePlaybackHost("${manifest.slug}")`);
      expect(source).toContain("playbackHost.playPattern");
      expect(source).toContain("renderPatternToWav");
    },
  );

  it("generates future sample tools on their own isolated engine via the shared host", () => {
    const skeleton = createToolSkeleton({
      description: "A generated sample-based glitch tool.",
      name: "Generated Glitch",
      slug: "generated-glitch",
    });
    const client = skeleton.files.get("app/tools/generated-glitch/client.tsx") ?? "";

    expect(skeleton.manifest.instrument).toMatchObject({
      document: "pattern",
      type: "sample",
      usesSamples: true,
    });
    expect(client).toContain('getSamplePlaybackHost("generated-glitch")');
    expect(client).toContain("playbackHost.playPattern");
    expect(client).toContain("renderPatternToWav");
  });
});
