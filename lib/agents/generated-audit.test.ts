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
} satisfies AgentManifest;
`,
      "utf8",
    );
    writeFileSync(join(toolRoot, "page.tsx"), "export default function Page() { return null; }\n");
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
      hasManifestFile: true,
      hasRouteFile: true,
      hasTests: true,
      registryMatchesManifest: true,
      routeMatchesSlug: true,
    });
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
  document?: AgentManifest["instrument"]["document"];
  globalContext?: boolean;
  instrumentType?: Exclude<AgentManifest["instrument"]["type"], "builder">;
  outputs?: Partial<AgentManifest["outputs"]>;
  prompt?: boolean;
  slug: string;
}): AgentManifest {
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
      requiredAnalysis: [],
      scaleSearch: false,
      samples: instrumentType === "sample" || instrumentType === "hybrid" ? ["break"] : [],
    },
    instrument: {
      document,
      type: instrumentType,
      usesSamples: instrumentType === "sample" || instrumentType === "hybrid",
      usesSynthesis: instrumentType === "synth" || instrumentType === "hybrid",
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
    outputs: {
      audio: false,
      files: false,
      manifest: false,
      midi: false,
      pattern: false,
      recording: false,
      synthScene: false,
      ...outputs,
    },
    route: `/tools/${slug}`,
    slug,
    status: "enabled",
  };
}
