import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createBuilderToolRuntime,
  editToolFile,
  instantiateSkeleton,
  readSchema,
  readToolFiles,
  registerTool,
  runToolAudioGate,
  runToolStaticAudit,
  runToolTests,
  runToolTypecheck,
  validateGeneratedManifest,
} from "@/lib/agents/builder-tools";

function createRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "builder-tools-"));
  for (const path of [
    "lib/pattern",
    "lib/agents",
    "lib/audio",
    "lib/visualizers",
    "lib/samples",
    "app/tools/evolving-fm-synth/lib",
  ]) {
    mkdirSync(join(rootDir, path), { recursive: true });
  }
  writeFileSync(join(rootDir, "lib/pattern/schema.ts"), "export const Pattern = 1;\n");
  writeFileSync(join(rootDir, "lib/agents/contract.ts"), "export const Agent = 1;\n");
  writeFileSync(join(rootDir, "lib/audio/fx-manifest.ts"), "export const Fx = 1;\n");
  writeFileSync(join(rootDir, "lib/visualizers/schema.ts"), "export const VisualizerScene = 1;\n");
  writeFileSync(join(rootDir, "lib/visualizers/audio-features.ts"), "export const AudioFeatures = 1;\n");
  writeFileSync(join(rootDir, "lib/samples/roles.ts"), "export const Roles = 1;\n");
  writeFileSync(
    join(rootDir, "app/tools/evolving-fm-synth/lib/schema.ts"),
    "export const SynthScene = 1;\n",
  );
  return rootDir;
}

describe("builder tools", () => {
  it("reads schemas and existing tool files", () => {
    const rootDir = createRoot();
    mkdirSync(join(rootDir, "app/tools/reference/lib"), { recursive: true });
    writeFileSync(join(rootDir, "app/tools/reference/lib/prompt.ts"), "export {}\n");
    const runtime = createBuilderToolRuntime({ rootDir });

    expect(Object.keys(readSchema(runtime).files)).toEqual([
      "lib/pattern/schema.ts",
      "lib/agents/contract.ts",
      "lib/audio/fx-manifest.ts",
      "lib/visualizers/schema.ts",
      "lib/visualizers/audio-features.ts",
      "lib/samples/roles.ts",
      "app/tools/evolving-fm-synth/lib/schema.ts",
    ]);
    expect(readToolFiles(runtime, { slug: "reference" }).files).toMatchObject({
      "app/tools/reference/lib/prompt.ts": "export {}\n",
    });
  });

  it("instantiates, edits, validates, and registers a generated skeleton", async () => {
    const rootDir = createRoot();
    const registryPath = join(rootDir, ".audit/generated-tools.json");
    const commands: string[] = [];
    const runtime = createBuilderToolRuntime({
      rootDir,
      generatedRegistryPath: registryPath,
      runCommand: async (invocation) => {
        commands.push([invocation.command, ...invocation.args].join(" "));
        return { exitCode: 0, stdout: "ok", stderr: "" };
      },
    });

    const skeleton = instantiateSkeleton(runtime, {
      slug: "vocal-stutter",
      name: "Vocal Stutter",
      description: "Turns a vocal sample into a chopped stutter instrument.",
      instrumentType: "sample",
    });
    expect(skeleton.files).toContain("app/tools/vocal-stutter/manifest.ts");
    const manifestPath = join(rootDir, "app/tools/vocal-stutter/manifest.ts");
    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, "utf8")
        .replace("export const vocalStutterManifest = ", "export const vocalStutterManifest: AgentManifest = ")
        .replace(" satisfies AgentManifest", ""),
    );

    editToolFile(runtime, {
      slug: "vocal-stutter",
      projectPath: "app/tools/vocal-stutter/README.md",
      content: "generated\n",
    });
    expect(readFileSync(join(rootDir, "app/tools/vocal-stutter/README.md"), "utf8")).toBe(
      "generated\n",
    );

    expect(validateGeneratedManifest(runtime, { slug: "vocal-stutter" })).toMatchObject({
      valid: true,
      manifest: { slug: "vocal-stutter" },
    });
    expect(await runToolTypecheck(runtime, { slug: "vocal-stutter" })).toMatchObject({
      passed: true,
    });
    expect(runToolStaticAudit(runtime, { slug: "vocal-stutter" })).toMatchObject({
      passed: true,
    });
    expect(await runToolTests(runtime, { slug: "vocal-stutter" })).toMatchObject({
      passed: true,
    });
    expect(await runToolAudioGate(runtime, { slug: "vocal-stutter" })).toMatchObject({
      passed: true,
    });
    expect(await registerTool(runtime, { slug: "vocal-stutter" })).toMatchObject({
      registered: true,
      audioGate: { passed: true },
      manifest: { slug: "vocal-stutter" },
      snapshot: { fileCount: expect.any(Number) },
      staticAudit: { passed: true },
    });
    expect(commands).toContain(
      "pnpm exec tsc --noEmit -p .audit/typecheck/tsconfig.vocal-stutter.json",
    );
    expect(commands).toContain(
      "pnpm exec vitest run --project audio app/tools/vocal-stutter/render.audio.test.ts",
    );
    expect(JSON.parse(readFileSync(registryPath, "utf8"))).toMatchObject({
      manifests: [{ slug: "vocal-stutter" }],
    });
  });

  it("rejects edits outside the generated tool sandbox", () => {
    const runtime = createBuilderToolRuntime({ rootDir: createRoot() });

    expect(() =>
      editToolFile(runtime, {
        slug: "vocal-stutter",
        projectPath: "package.json",
        content: "{}",
      }),
    ).toThrow();
  });

  it("rejects syntactically invalid TSX edits without overwriting the existing file", () => {
    const rootDir = createRoot();
    const runtime = createBuilderToolRuntime({ rootDir });
    const clientPath = join(rootDir, "app/tools/syntax-guard/client.tsx");
    mkdirSync(join(rootDir, "app/tools/syntax-guard"), { recursive: true });
    const original = `"use client";\nexport function Client() { return null; }\n`;
    writeFileSync(clientPath, original, "utf8");

    const result = editToolFile(runtime, {
      slug: "syntax-guard",
      projectPath: "app/tools/syntax-guard/client.tsx",
      content: `"use client";\nexport function Client() {\n  const label = "broken;\n  return <button>{label}</button>;\n}\n`,
    });

    expect(result).toMatchObject({
      reason: "source syntax failed",
      syntaxAudit: { command: "syntax-audit", passed: false },
      written: false,
    });
    expect(readFileSync(clientPath, "utf8")).toBe(original);
  });
});
