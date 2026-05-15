import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createGeneratedToolAudit } from "@/lib/agents/generated-audit";
import type { AgentManifest } from "@/lib/agents/contract";

describe("generated tool audit", () => {
  it("summarizes an empty generated registry", () => {
    const audit = createGeneratedToolAudit([]);

    expect(audit).toMatchObject({
      generatedCount: 0,
      readyCount: 0,
      status: "empty",
      summary: "No L2-generated tools are registered yet.",
    });
    expect(audit.issues).toEqual([
      expect.objectContaining({
        id: "registry-empty",
        severity: "info",
      }),
    ]);
  });

  it("counts ready generated tools by instrument and document", () => {
    const audit = createGeneratedToolAudit([
      generatedManifest({
        document: "pattern",
        instrumentType: "sample",
        slug: "generated-break",
      }),
      generatedManifest({
        document: "synth-scene",
        instrumentType: "synth",
        outputs: { synthScene: true },
        slug: "generated-pad",
      }),
    ]);

    expect(audit).toMatchObject({
      byDocument: {
        pattern: 1,
        "synth-scene": 1,
      },
      byInstrument: {
        sample: 1,
        synth: 1,
      },
      generatedCount: 2,
      readyCount: 2,
      status: "ready",
      summary: "2/2 generated tools ready for dashboard use.",
    });
    expect(audit.issues).toEqual([]);
  });

  it("treats MIDI clips as renderable MIDI document outputs", () => {
    const audit = createGeneratedToolAudit([
      generatedManifest({
        document: "midi-clip",
        instrumentType: "midi",
        outputs: { midi: true },
        slug: "generated-midi",
      }),
    ]);

    expect(audit).toMatchObject({
      byDocument: {
        "midi-clip": 1,
      },
      byInstrument: {
        midi: 1,
      },
      readyCount: 1,
      status: "ready",
    });
    expect(audit.entries[0]).toMatchObject({
      hasDocumentOutput: true,
      hasRenderableOutput: true,
    });
  });

  it("treats visual scenes as renderable visual document outputs", () => {
    const audit = createGeneratedToolAudit([
      generatedManifest({
        document: "visual-scene",
        instrumentType: "visualizer",
        outputs: { audio: true, visualScene: true },
        slug: "generated-visualizer",
      }),
    ]);

    expect(audit).toMatchObject({
      byDocument: {
        "visual-scene": 1,
      },
      byInstrument: {
        visualizer: 1,
      },
      readyCount: 1,
      status: "ready",
    });
    expect(audit.entries[0]).toMatchObject({
      hasDocumentOutput: true,
      hasRenderableOutput: true,
    });
  });

  it("surfaces generated tools that are not prompt-first or renderable", () => {
    const audit = createGeneratedToolAudit([
      generatedManifest({
        globalContext: false,
        outputs: {},
        prompt: false,
        slug: "weak-tool",
      }),
    ]);

    expect(audit).toMatchObject({
      generatedCount: 1,
      readyCount: 0,
      status: "attention",
    });
    expect(audit.issues.map((issue) => issue.id)).toEqual([
      "weak-tool:prompt",
      "weak-tool:output",
      "weak-tool:document-output",
      "weak-tool:context",
    ]);
  });

  it("checks generated registry entries against in-tree files when requested", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "generated-audit-"));
    const toolRoot = join(rootDir, "app", "tools", "generated-break");
    mkdirSync(toolRoot, { recursive: true });
    writeFileSync(
      join(toolRoot, "manifest.ts"),
      `import type { AgentManifest } from "@/lib/agents/contract";
export const generatedBreakManifest = {
  name: "generated-break",
  slug: "generated-break",
  level: 1,
  origin: "generated",
  description: "generated-break generated tool",
  route: "/tools/generated-break",
  instrument: {
    type: "sample",
    workflow: "sample-workflow",
    document: "pattern",
    usesSamples: true,
    usesSynthesis: false,
  },
  outputs: { pattern: true, audio: true },
  exports: {
    document: "pattern",
    audio: {
      strategy: "offline-render",
      formats: ["wav"],
      maxDefaultDurationSec: 120,
      requiresUserGestureForPreview: true,
    },
  },
} satisfies AgentManifest;
`,
      "utf8",
    );
    writeFileSync(join(toolRoot, "page.tsx"), "export default function Page() { return null; }\n");
    writeFileSync(join(toolRoot, "render.ts"), "export async function renderOffline() { return null; }\n");
    writeFileSync(join(toolRoot, "render.audio.test.ts"), "import { it } from 'vitest'; it('renders audio', () => {});\n");
    writeFileSync(join(toolRoot, "client.test.tsx"), "import { it } from 'vitest'; it('works', () => {});\n");

    const audit = createGeneratedToolAudit(
      [generatedManifest({ slug: "generated-break" })],
      { checkFiles: true, rootDir },
    );

    expect(audit).toMatchObject({
      readyCount: 1,
      status: "ready",
    });
    expect(audit.entries[0]).toMatchObject({
      hasDocumentOutput: true,
      hasAudioGateTest: true,
      hasManifestFile: true,
      hasOfflineRenderer: true,
      hasRouteFile: true,
      hasTests: true,
      registryMatchesManifest: true,
      routeMatchesSlug: true,
    });
  });

  it("flags generated in-tree tools that are missing from the generated registry", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "generated-audit-unregistered-"));
    const manifest = generatedManifest({
      document: "audio-stream",
      instrumentType: "effect",
      outputs: { audio: true, recording: true },
      slug: "unregistered-effect",
    });
    const toolRoot = join(rootDir, "app", "tools", manifest.slug);
    mkdirSync(toolRoot, { recursive: true });
    writeFileSync(
      join(toolRoot, "manifest.ts"),
      `import type { AgentManifest } from "@/lib/agents/contract";
export const unregisteredEffectManifest = ${JSON.stringify(manifest, null, 2)} satisfies AgentManifest;
`,
      "utf8",
    );
    writeFileSync(join(toolRoot, "page.tsx"), "export default function Page() { return null; }\n");
    writeFileSync(join(toolRoot, "render.ts"), "export async function renderOffline() { return null; }\n");
    writeFileSync(join(toolRoot, "render.audio.test.ts"), "import { it } from 'vitest'; it('renders audio', () => {});\n");
    writeFileSync(join(toolRoot, "client.test.tsx"), "import { it } from 'vitest'; it('works', () => {});\n");

    const audit = createGeneratedToolAudit([], {
      checkFiles: true,
      inTreeManifests: [manifest],
      rootDir,
    });

    expect(audit).toMatchObject({
      generatedCount: 1,
      readyCount: 0,
      status: "attention",
    });
    expect(audit.entries[0]).toMatchObject({
      hasInTreeManifest: true,
      registered: false,
      slug: "unregistered-effect",
    });
    expect(audit.issues.map((issue) => issue.id)).toContain(
      "unregistered-effect:registry-entry",
    );
  });

  it("flags generated registry entries that are missing from the in-tree manifests", () => {
    const audit = createGeneratedToolAudit(
      [generatedManifest({ slug: "orphan-registry-tool" })],
      { inTreeManifests: [] },
    );

    expect(audit.status).toBe("attention");
    expect(audit.readyCount).toBe(0);
    expect(audit.entries[0]).toMatchObject({
      hasInTreeManifest: false,
      registered: true,
    });
    expect(audit.issues.map((issue) => issue.id)).toContain(
      "orphan-registry-tool:in-tree-manifest",
    );
  });

  it("requires generated routes and declared outputs to match document contracts", () => {
    const audit = createGeneratedToolAudit([
      {
        ...generatedManifest({
          outputs: { audio: true },
          slug: "bad-route",
        }),
        route: "/tools/not-bad-route",
      },
    ]);

    expect(audit.status).toBe("attention");
    expect(audit.readyCount).toBe(0);
    expect(audit.issues.map((issue) => issue.id)).toEqual([
      "bad-route:document-output",
      "bad-route:route-contract",
    ]);
  });

  it("flags orphaned generated registry entries", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "generated-audit-missing-"));
    const audit = createGeneratedToolAudit(
      [generatedManifest({ slug: "missing-tool" })],
      { checkFiles: true, rootDir },
    );

    expect(audit.status).toBe("attention");
    expect(audit.readyCount).toBe(0);
    expect(audit.issues.map((issue) => issue.id)).toEqual([
      "missing-tool:manifest-file",
      "missing-tool:route-file",
      "missing-tool:tests",
      "missing-tool:offline-renderer",
      "missing-tool:audio-gate-test",
      "missing-tool:registry-mismatch",
    ]);
  });
});

function generatedManifest({
  document = "pattern",
  globalContext = true,
  instrumentType = "sample",
  outputs = { pattern: true, audio: true },
  prompt = true,
  slug,
}: {
  document?: Exclude<AgentManifest["instrument"]["document"], "files">;
  globalContext?: boolean;
  instrumentType?: Exclude<AgentManifest["instrument"]["type"], "builder">;
  outputs?: Partial<AgentManifest["outputs"]>;
  prompt?: boolean;
  slug: string;
}): AgentManifest {
  const normalizedOutputs = {
    audio: false,
    files: false,
    manifest: false,
    midi: false,
    pattern: false,
    recording: false,
    synthScene: false,
    visualScene: false,
    ...outputs,
  };

  return {
    autonomy: "driven",
    capabilities: ["generatePattern", "play", "recordOutput"],
    description: `${slug} generated tool`,
    inputs: {
      bpm: true,
      description: false,
      globalBpm: false,
      globalKey: false,
      prompt,
      referenceAgent: false,
      audioSources: instrumentType === "visualizer" ? ["live-audio", "audio-file", "microphone"] : [],
      requiredAnalysis: [],
      scaleSearch: false,
      samples: instrumentType === "sample" || instrumentType === "hybrid" || instrumentType === "visualizer" ? ["break"] : [],
    },
    instrument: {
      document,
      type: instrumentType,
      usesSamples: instrumentType === "sample" || instrumentType === "hybrid" || instrumentType === "visualizer",
      usesSynthesis: instrumentType === "synth" || instrumentType === "hybrid" || instrumentType === "visualizer",
      workflow: `${instrumentType}-workflow`,
    },
    level: 1,
    musicContext: {
      globalBpm: globalContext,
      globalKey: globalContext,
      scaleSearch: globalContext,
    },
    name: slug,
    origin: "generated",
    outputs: normalizedOutputs,
    exports: createGeneratedExportContract(document, normalizedOutputs),
    route: `/tools/${slug}`,
    slug,
    status: "enabled",
  };
}

function createGeneratedExportContract(
  document: Exclude<AgentManifest["instrument"]["document"], "files">,
  outputs: AgentManifest["outputs"],
): AgentManifest["exports"] {
  if (!outputs.audio && !outputs.midi) {
    return undefined;
  }

  return {
    document,
    ...(outputs.audio
      ? {
          audio: {
            strategy:
              document === "audio-stream"
                ? "live-recording"
                : document === "visual-scene"
                  ? "source-audio"
                  : "offline-render",
            formats: ["wav"] as const,
            maxDefaultDurationSec: 120,
            requiresUserGestureForPreview: true,
          },
        }
      : {}),
    ...(outputs.midi
      ? {
          midi: {
            strategy: "standard-midi-file",
            format: "smf-1",
            ticksPerQuarter: 480,
            preservesTracks: true,
            supportsPitchBend: true,
            supportsCc: document === "midi-clip",
          },
        }
      : {}),
  };
}
