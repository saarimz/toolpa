import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ToolSuiteDashboard } from "@/app/dashboard/tool-suite-dashboard";
import type { AgentManifest } from "@/lib/agents/contract";
import type { GeneratedToolAudit } from "@/lib/agents/generated-audit";
import type { PlatformHardeningAudit } from "@/lib/agents/platform-hardening";

describe("ToolSuiteDashboard", () => {
  it("renders the installed L1 catalog as the primary product surface", () => {
    render(
      <ToolSuiteDashboard
        generatedAudit={readyAudit}
        hasGatewayKey
        manifests={[installedTool, generatedTool, sampleBuilder, synthBuilder]}
        platformAudit={readyPlatformAudit}
      />,
    );

    expect(screen.getByRole("heading", { name: "AI-native instrument suite" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /build L1 tool/i })).toHaveAttribute("href", "/build");
    expect(screen.getByText("Break Slicer")).toBeInTheDocument();
    expect(screen.queryByText("Generated Stutter")).not.toBeInTheDocument();
    expect(screen.queryByText("Sample Builder")).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(["song", "canvas"].join(" "), "i"))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(["stems", "board"].join(" "), "i"))).not.toBeInTheDocument();
  });

  it("filters generated L1 tools and exposes rebuild links", async () => {
    const user = userEvent.setup();
    render(
      <ToolSuiteDashboard
        generatedAudit={readyAudit}
        hasGatewayKey
        manifests={[installedTool, generatedTool, sampleBuilder]}
        platformAudit={readyPlatformAudit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generated L1" }));

    expect(screen.getByText("Generated Stutter")).toBeInTheDocument();
    expect(screen.queryByText("Break Slicer")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /rebuild/i })).toHaveAttribute(
      "href",
      "/build?edit=generated-stutter",
    );
  });

  it("filters L2 builders by target family metadata", async () => {
    const user = userEvent.setup();
    render(
      <ToolSuiteDashboard
        generatedAudit={emptyAudit}
        hasGatewayKey
        manifests={[installedTool, sampleBuilder, synthBuilder]}
        platformAudit={readyPlatformAudit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "L2 Builders" }));
    expect(screen.getByText("Sample Builder")).toBeInTheDocument();
    expect(screen.getByText("Synth Builder")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Synth" }));
    const catalog = screen.getByLabelText("tool catalog");
    expect(within(catalog).getByText("Synth Builder")).toBeInTheDocument();
    expect(within(catalog).queryByText("Sample Builder")).not.toBeInTheDocument();
  });

  it("surfaces generated registry audit issues", () => {
    render(
      <ToolSuiteDashboard
        generatedAudit={{
          ...readyAudit,
          issues: [
            {
              detail: "generated-stutter has no generated-tool test file.",
              id: "generated-stutter:tests",
              severity: "warning",
              slug: "generated-stutter",
            },
          ],
          status: "attention",
        }}
        hasGatewayKey={false}
        manifests={[installedTool, generatedTool]}
        platformAudit={readyPlatformAudit}
      />,
    );

    expect(screen.getByText(/AI generation is disabled/)).toBeInTheDocument();
    expect(screen.getByText(/generated-stutter has no generated-tool test file/)).toBeInTheDocument();
  });

  it("surfaces L1/L2 platform hardening issues", () => {
    render(
      <ToolSuiteDashboard
        generatedAudit={readyAudit}
        hasGatewayKey
        manifests={[installedTool, generatedTool]}
        platformAudit={{
          ...readyPlatformAudit,
          issues: [
            {
              detail: "generated-stutter route must be /tools/generated-stutter.",
              id: "generated-stutter:l1-route",
              severity: "error",
              slug: "generated-stutter",
            },
          ],
          status: "attention",
          summary: "1 L1/L2 platform hardening issue found.",
        }}
      />,
    );

    expect(screen.getAllByText("attention").length).toBeGreaterThan(0);
    expect(screen.getByText(/generated-stutter route must be/)).toBeInTheDocument();
  });
});

const installedTool = toolManifest({
  name: "Break Slicer",
  origin: "installed",
  slug: "break-slicer",
});

const generatedTool = toolManifest({
  name: "Generated Stutter",
  origin: "generated",
  slug: "generated-stutter",
});

const sampleBuilder = builderManifest({
  name: "Sample Builder",
  slug: "_sample-builder",
  workflow: "sample-l2-builder",
});

const synthBuilder = builderManifest({
  name: "Synth Builder",
  slug: "_synth-builder",
  type: "synth",
  workflow: "synth-l2-builder",
});

const emptyAudit: GeneratedToolAudit = {
  byDocument: {},
  byInstrument: {},
  entries: [],
  generatedCount: 0,
  issues: [],
  readyCount: 0,
  status: "empty",
  summary: "No L2-generated tools are registered yet.",
};

const readyAudit: GeneratedToolAudit = {
  byDocument: { pattern: 1 },
  byInstrument: { sample: 1 },
  entries: [],
  generatedCount: 1,
  issues: [],
  readyCount: 1,
  status: "ready",
  summary: "1/1 generated tools ready for dashboard use.",
};

const readyPlatformAudit: PlatformHardeningAudit = {
  conventions: [],
  issues: [],
  l1Count: 2,
  l2Count: 2,
  specializedBuilderCount: 5,
  status: "ready",
  summary: "2 L1 tools and 2 L2 builders pass platform hardening gates.",
};

function toolManifest({
  name,
  origin,
  slug,
}: {
  name: string;
  origin: "installed" | "generated";
  slug: string;
}): AgentManifest {
  return {
    autonomy: "assist",
    capabilities: ["generatePattern", "play", "recordOutput"],
    description: `${name} description`,
    inputs: {
      bpm: true,
      description: false,
      globalBpm: true,
      globalKey: true,
      prompt: true,
      referenceAgent: false,
      requiredAnalysis: [],
      scaleSearch: true,
      samples: ["break"],
    },
    instrument: {
      document: "pattern",
      type: "sample",
      usesSamples: true,
      usesSynthesis: false,
      workflow: "sample-pattern",
    },
    level: 1,
    musicContext: {
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
    },
    name,
    origin,
    outputs: {
      audio: true,
      files: false,
      manifest: false,
      midi: false,
      pattern: true,
      recording: true,
      synthScene: false,
    },
    route: `/tools/${slug}`,
    slug,
    status: "enabled",
  };
}

function builderManifest({
  name,
  slug,
  type = "sample",
  workflow,
}: {
  name: string;
  slug: string;
  type?: Exclude<AgentManifest["instrument"]["type"], "builder">;
  workflow: string;
}): AgentManifest {
  return {
    autonomy: "driven",
    capabilities: ["generateTool", "verifyTool", "registerTool"],
    description: `${name} description`,
    inputs: {
      bpm: false,
      description: true,
      globalBpm: false,
      globalKey: false,
      prompt: false,
      referenceAgent: true,
      requiredAnalysis: [],
      scaleSearch: false,
      samples: [],
    },
    instrument: {
      document: "files",
      type: "builder",
      usesSamples: false,
      usesSynthesis: false,
      workflow,
    },
    level: 2,
    musicContext: {
      globalBpm: false,
      globalKey: false,
      scaleSearch: false,
    },
    name,
    origin: "installed",
    outputs: {
      audio: false,
      files: true,
      manifest: true,
      midi: false,
      pattern: false,
      recording: false,
      synthScene: false,
    },
    route: `/build/${type}`,
    slug,
    status: "enabled",
  };
}
