import { describe, expect, it } from "vitest";

import { intelligenceSamplerManifest } from "@/app/tools/intelligence-sampler/manifest";
import { buildBuilderProgress } from "@/lib/agents/builder-progress";
import type { BuilderStreamChunk } from "@/lib/agents/builder-contracts";

describe("buildBuilderProgress", () => {
  it("starts idle with a clear next action", () => {
    const progress = buildBuilderProgress([]);

    expect(progress.status).toBe("idle");
    expect(progress.completedCount).toBe(0);
    expect(progress.nextAction).toContain("Describe a tool");
    expect(progress.stages.at(0)).toMatchObject({
      id: "brief",
      status: "pending",
    });
  });

  it("tracks a successful registered L2 run through every gate", () => {
    const progress = buildBuilderProgress([
      { type: "decision", message: "instrument workflow: sample" },
      { type: "tool-call", name: "readSchema", input: {}, result: { files: {} } },
      {
        type: "tool-call",
        name: "readToolFiles",
        input: { slug: "intelligence-sampler" },
        result: { files: {}, missing: false },
      },
      {
        type: "alternative",
        message: "generated files stay inside app/tools/<slug>/",
      },
      {
        type: "tool-call",
        name: "instantiateSkeleton",
        input: { slug: "vocal-stutter" },
        result: { files: ["app/tools/vocal-stutter/page.tsx"] },
      },
      { type: "file", path: "app/tools/vocal-stutter/page.tsx" },
      {
        type: "verification",
        name: "manifest",
        passed: true,
      },
      {
        type: "verification",
        name: "typecheck",
        passed: true,
      },
      {
        type: "verification",
        name: "tests",
        passed: true,
      },
      {
        type: "complete",
        files: ["app/tools/vocal-stutter/page.tsx"],
        manifest: {
          ...intelligenceSamplerManifest,
          name: "Vocal Stutter",
          route: "/tools/vocal-stutter",
          slug: "vocal-stutter",
        },
        registered: true,
      },
    ] satisfies BuilderStreamChunk[]);

    expect(progress.status).toBe("complete");
    expect(progress.completedCount).toBe(progress.totalCount);
    expect(progress.nextAction).toContain("Open the dashboard");
    expect(progress.stages.map((stage) => stage.status)).toEqual(
      Array.from({ length: progress.totalCount }, () => "passed"),
    );
  });

  it("surfaces verification failures as failed stages with diagnostics", () => {
    const progress = buildBuilderProgress([
      { type: "decision", message: "instrument workflow: sample" },
      {
        type: "verification",
        name: "typecheck",
        passed: false,
        stderr: "Type error in generated client",
      },
    ]);

    expect(progress.status).toBe("failed");
    expect(progress.nextAction).toContain("Fix typecheck passed");
    expect(progress.nextAction).toContain("Type error in generated client");
    expect(progress.stages.find((stage) => stage.id === "typecheck")).toMatchObject({
      evidence: "Type error in generated client",
      status: "failed",
    });
  });

  it("treats sandbox breaches as blocked runs", () => {
    const progress = buildBuilderProgress([
      { type: "decision", message: "instrument workflow: sample" },
      {
        type: "breach",
        message: "cannot write outside app/tools/granular-delay",
      },
    ]);

    expect(progress.status).toBe("blocked");
    expect(progress.nextAction).toContain("Resolve sandbox breach");
    expect(progress.stages.find((stage) => stage.id === "sandbox")).toMatchObject({
      evidence: "cannot write outside app/tools/granular-delay",
      status: "blocked",
    });
  });

  it("marks the next unfinished stage active while a run is streaming", () => {
    const progress = buildBuilderProgress(
      [
        { type: "decision", message: "instrument workflow: sample" },
        { type: "tool-call", name: "readSchema", input: {}, result: { files: {} } },
      ],
      { isBuilding: true },
    );

    expect(progress.status).toBe("running");
    expect(progress.activeLabel).toBe("reference studied");
    expect(progress.stages.find((stage) => stage.id === "reference")).toMatchObject({
      status: "active",
    });
  });
});
