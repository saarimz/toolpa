import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runBuilderAgent } from "@/app/tools/_builder/lib/builder-agent";
import type { BuilderStreamChunk } from "@/lib/agents/builder-contracts";

function createRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "builder-agent-"));
  for (const path of [
    "lib/pattern",
    "lib/agents",
    "lib/samples",
    "app/tools/intelligence-sampler/lib",
  ]) {
    mkdirSync(join(rootDir, path), { recursive: true });
  }
  writeFileSync(join(rootDir, "lib/pattern/schema.ts"), "export const Pattern = 1;\n");
  writeFileSync(join(rootDir, "lib/agents/contract.ts"), "export const Agent = 1;\n");
  writeFileSync(join(rootDir, "lib/samples/roles.ts"), "export const Roles = 1;\n");
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

  it("classifies synth requests and refuses the sample skeleton instead of mislabeling them", async () => {
    const chunks: BuilderStreamChunk[] = [];

    await expect(
      runBuilderAgent({
        description: "a prompt driven FM synth with wavetable pads",
        name: "FM Pad Synth",
        slug: "fm-pad-synth",
        rootDir: createRoot(),
        register: false,
        onChunk: (chunk) => chunks.push(chunk),
      }),
    ).rejects.toThrow(/sample-pattern only/);

    expect(chunks).toContainEqual({
      type: "decision",
      message: "instrument workflow: synth",
    });
    expect(chunks).toContainEqual({
      type: "decision",
      message: "using evolving-fm-synth as the reference tool shape",
    });
    expect(chunks.some((chunk) => chunk.type === "breach")).toBe(true);
  });
});
