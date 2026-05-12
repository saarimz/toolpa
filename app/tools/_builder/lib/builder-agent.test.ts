import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runBuilderAgent } from "@/app/tools/_builder/lib/builder-agent";
import type {
  BuilderStreamChunk,
  BuildToolSpecialization,
} from "@/lib/agents/builder-contracts";

function createRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "builder-agent-"));
  for (const path of [
    "lib/pattern",
    "lib/agents",
    "lib/samples",
    "app/tools/intelligence-sampler/lib",
    "app/tools/evolving-fm-synth/lib",
  ]) {
    mkdirSync(join(rootDir, path), { recursive: true });
  }
  writeFileSync(join(rootDir, "lib/pattern/schema.ts"), "export const Pattern = 1;\n");
  writeFileSync(join(rootDir, "lib/agents/contract.ts"), "export const Agent = 1;\n");
  writeFileSync(join(rootDir, "lib/samples/roles.ts"), "export const Roles = 1;\n");
  writeFileSync(
    join(rootDir, "app/tools/evolving-fm-synth/lib/schema.ts"),
    "export const SynthScene = 1;\n",
  );
  writeFileSync(
    join(rootDir, "app/tools/intelligence-sampler/lib/prompt.ts"),
    "export const prompt = 'reference';\n",
  );
  return rootDir;
}

describe("runBuilderAgent", () => {
  it("streams decisions, writes a tool, verifies it, and registers it", async () => {
    const rootDir = createRoot();
    const registryPath = join(rootDir, ".audit/generated-tools.json");
    const chunks: BuilderStreamChunk[] = [];

    const result = await runBuilderAgent({
      description: "a tool that stutters a vocal sample with probabilistic repeats",
      name: "Vocal Stutter",
      slug: "vocal-stutter",
      instrumentType: "sample",
      generatedRegistryPath: registryPath,
      rootDir,
      runCommand: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(result.registered).toBe(true);
    expect(result.manifest.slug).toBe("vocal-stutter");
    expect(chunks.map((chunk) => chunk.type)).toEqual(
      expect.arrayContaining(["decision", "alternative", "file", "complete"]),
    );
    expect(chunks).toContainEqual({
      type: "decision",
      message: "using intelligence-sampler as the reference tool shape",
    });
    expect(readFileSync(registryPath, "utf8")).toContain("vocal-stutter");
  });

  it("can generate files without registering", async () => {
    const result = await runBuilderAgent({
      description: "a tool that slices pads into slow phase patterns",
      name: "Pad Phase",
      slug: "pad-phase",
      referenceAgent: "intelligence-sampler",
      rootDir: createRoot(),
      register: false,
    });

    expect(result.registered).toBe(false);
    expect(result.files).toContain("app/tools/pad-phase/manifest.ts");
  });

  it("derives name and slug from the request description when omitted", async () => {
    const result = await runBuilderAgent({
      description: "a granular pad freezer with reverse trails",
      rootDir: createRoot(),
      register: false,
    });

    expect(result.manifest).toMatchObject({
      name: "Granular Pad Freezer",
      route: "/tools/granular-pad-freezer",
      slug: "granular-pad-freezer",
    });
    expect(result.files).toContain("app/tools/granular-pad-freezer/manifest.ts");
  });

  it("classifies synth requests and writes a synth-scene skeleton", async () => {
    const chunks: BuilderStreamChunk[] = [];

    const result = await runBuilderAgent({
      description: "a prompt driven FM synth with wavetable pads",
      name: "FM Pad Synth",
      slug: "fm-pad-synth",
      rootDir: createRoot(),
      register: false,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(result.registered).toBe(false);
    expect(result.manifest).toMatchObject({
      slug: "fm-pad-synth",
      instrument: {
        type: "synth",
        document: "synth-scene",
      },
      outputs: {
        synthScene: true,
      },
    });
    expect(chunks).toContainEqual({
      type: "decision",
      message: "instrument workflow: synth",
    });
    expect(chunks).toContainEqual({
      type: "decision",
      message: "using evolving-fm-synth as the reference tool shape",
    });
    expect(chunks.some((chunk) => chunk.type === "breach")).toBe(false);
    expect(chunks.some((chunk) => chunk.type === "complete")).toBe(true);
  });

  it("classifies effect requests and writes an audio-stream skeleton", async () => {
    const chunks: BuilderStreamChunk[] = [];

    const result = await runBuilderAgent({
      description: "a prompt driven dub delay effect processor for live input",
      name: "Dub Delay Effect",
      slug: "dub-delay-effect",
      rootDir: createRoot(),
      register: false,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(result.registered).toBe(false);
    expect(result.manifest).toMatchObject({
      slug: "dub-delay-effect",
      instrument: {
        type: "effect",
        document: "audio-stream",
      },
      outputs: {
        audio: true,
      },
    });
    expect(chunks).toContainEqual({
      type: "decision",
      message: "instrument workflow: effect",
    });
    expect(chunks).toContainEqual({
      type: "decision",
      message: "using splice-lab as the reference tool shape",
    });
    expect(chunks.some((chunk) => chunk.type === "breach")).toBe(false);
    expect(chunks.some((chunk) => chunk.type === "complete")).toBe(true);
  });

  it("classifies hybrid requests and writes a sample-informed synth-scene skeleton", async () => {
    const chunks: BuilderStreamChunk[] = [];

    const result = await runBuilderAgent({
      description: "a hybrid sample and synth tool that uses a source loop as timbral reference",
      name: "Loop Hybrid",
      slug: "loop-hybrid",
      rootDir: createRoot(),
      register: false,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(result.registered).toBe(false);
    expect(result.manifest).toMatchObject({
      slug: "loop-hybrid",
      instrument: {
        type: "hybrid",
        document: "synth-scene",
        usesSamples: true,
        usesSynthesis: true,
      },
      outputs: {
        synthScene: true,
      },
    });
    expect(chunks).toContainEqual({
      type: "decision",
      message: "instrument workflow: hybrid",
    });
    expect(chunks).toContainEqual({
      type: "decision",
      message: "using splice-lab as the reference tool shape",
    });
    expect(chunks.some((chunk) => chunk.type === "breach")).toBe(false);
    expect(chunks.some((chunk) => chunk.type === "complete")).toBe(true);
  });

  it("threads builder specialization into decisions and generated tool prompts", async () => {
    const rootDir = createRoot();
    const chunks: BuilderStreamChunk[] = [];

    const result = await runBuilderAgent({
      description: "a microtonal break sampler for 31-EDO percussion",
      name: "Microtonal Breaks",
      slug: "microtonal-breaks",
      instrumentType: "sample",
      builderSpecialization: createSpecialization({
        domain: "microtonal",
        builderSlug: "_microtonal-builder",
        targetInstrumentType: "sample",
        targetDocument: "pattern",
        targetWorkflow: "microtonal-sample-pattern",
        templateKit: "microtonal-pattern-tool-skeleton",
        referenceAgent: "intelligence-sampler",
        constraints: [
          "Generated microtonal tools must expose pitchCents and tuningRef.",
        ],
        verificationGates: [
          "Generated playback tests assert pitchCents/tuningRef produce non-12TET playback rates.",
        ],
      }),
      rootDir,
      register: false,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(result.manifest).toMatchObject({
      instrument: {
        type: "sample",
        document: "pattern",
      },
    });
    expect(chunks).toContainEqual({
      type: "decision",
      message: "builder specialization: microtonal via _microtonal-builder",
    });
    expect(chunks).toContainEqual({
      type: "decision",
      message:
        "specialized target: pattern / microtonal-sample-pattern using microtonal-pattern-tool-skeleton",
    });
    expect(
      readFileSync(
        join(rootDir, "app/tools/microtonal-breaks/lib/prompt.ts"),
        "utf8",
      ),
    ).toContain("Specialized builder profile: microtonal");
    expect(
      readFileSync(
        join(rootDir, "app/tools/microtonal-breaks/lib/prompt.ts"),
        "utf8",
      ),
    ).toContain("pitchCents and tuningRef");
  });

  it("rejects builder specialization mismatches before writing files", async () => {
    const chunks: BuilderStreamChunk[] = [];

    await expect(
      runBuilderAgent({
        description: "a synth tool sent through the wrong specialization",
        name: "Wrong Builder",
        slug: "wrong-builder",
        instrumentType: "synth",
        builderSpecialization: createSpecialization({
          domain: "sample",
          builderSlug: "_sample-builder",
          targetInstrumentType: "sample",
          targetDocument: "pattern",
          targetWorkflow: "sample-pattern",
          templateKit: "sample-pattern-tool-skeleton",
          referenceAgent: "intelligence-sampler",
        }),
        rootDir: createRoot(),
        register: false,
        onChunk: (chunk) => chunks.push(chunk),
      }),
    ).rejects.toThrow(
      "Builder specialization target sample does not match resolved instrument workflow synth.",
    );
    expect(chunks).toContainEqual({
      type: "breach",
      message:
        "Builder specialization target sample does not match resolved instrument workflow synth.",
    });
  });
});

function createSpecialization(
  overrides: Partial<BuildToolSpecialization> = {},
): BuildToolSpecialization {
  return {
    domain: "synth",
    builderSlug: "_synth-builder",
    targetInstrumentType: "synth",
    targetDocument: "synth-scene",
    targetWorkflow: "synth-scene",
    templateKit: "synth-scene-tool-skeleton",
    referenceAgent: "evolving-fm-synth",
    constraints: [],
    verificationGates: [],
    ...overrides,
  };
}
