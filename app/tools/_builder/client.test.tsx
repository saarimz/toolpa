import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolBuilderClient } from "@/app/tools/_builder/client";
import { createBuilderProfilePlan } from "@/lib/agents/builder-profiles";
import { intelligenceSamplerManifest } from "@/app/tools/intelligence-sampler/manifest";
import type { BuilderStreamChunk } from "@/lib/agents/builder-contracts";
import type { GeneratedToolAudit } from "@/lib/agents/generated-audit";

describe("ToolBuilderClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a simplified builder canvas with advanced transparency collapsed", () => {
    render(<ToolBuilderClient generatedAudit={emptyGeneratedAudit} />);

    expect(screen.getByRole("heading", { name: "Build a tool" })).toBeInTheDocument();
    expect(screen.getByText(/tool-builder/)).toBeInTheDocument();
    expect(screen.getByText("Describe it")).toBeInTheDocument();
    expect(screen.getByText("Pick a family")).toBeInTheDocument();
    expect(screen.getByText("Build and verify")).toBeInTheDocument();
    expect(screen.getByLabelText("description")).toBeInTheDocument();
    expect(screen.getByLabelText("instrument")).toBeInTheDocument();
    expect(screen.getByLabelText("token budget")).toBeInTheDocument();
    expect(screen.getByLabelText("builder run monitor")).toHaveTextContent(
      "Describe a tool",
    );
    expect(screen.getByLabelText("generated tool audit")).toHaveTextContent(
      "No L2-generated tools are registered yet.",
    );
    expect(screen.getByText("decisions")).toBeInTheDocument();
    expect(screen.getByText("alternatives not taken")).toBeInTheDocument();
    expect(screen.getByText("breach")).toBeInTheDocument();
    expect(screen.getByText("files produced")).toBeInTheDocument();
    expect(screen.getByText("advanced naming and budget")).toBeInTheDocument();
    expect(screen.getByText("agent transcript")).toBeInTheDocument();
    expect(screen.getByText("advanced build details")).toBeInTheDocument();
  });

  it("accepts an initial brief from dashboard links", () => {
    render(
      <ToolBuilderClient
        initialDescription="Build an L1 music tool for dub techno chops."
        initialInstrumentType="sample"
        initialName="Dub Tool"
        initialSlug="dub-tool"
      />,
    );

    expect(screen.getByLabelText("description")).toHaveValue(
      "Build an L1 music tool for dub techno chops.",
    );
    expect(screen.getByLabelText("instrument")).toHaveValue("sample");
    expect(screen.getByLabelText("name")).toHaveValue("Dub Tool");
    expect(screen.getByLabelText("slug")).toHaveValue("dub-tool");
  });

  it("derives the submitted name and slug from the current description", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createNdjsonResponse([]));
    const user = userEvent.setup();

    render(<ToolBuilderClient />);

    await user.clear(screen.getByLabelText("description"));
    await user.type(
      screen.getByLabelText("description"),
      "a granular pad freezer with reverse trails",
    );
    expect(screen.getByLabelText("name")).toHaveValue("Granular Pad Freezer");
    expect(screen.getByLabelText("slug")).toHaveValue("granular-pad-freezer");

    await user.click(screen.getByRole("button", { name: /build/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const requestBody = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      description: "a granular pad freezer with reverse trails",
      name: "Granular Pad Freezer",
      slug: "granular-pad-freezer",
    });
    expect(requestBody.slug).not.toBe("vocal-stutter");
  });

  it("hydrates synth briefs with the synth reference agent selected", () => {
    render(
      <ToolBuilderClient
        initialDescription="Build an L1 music tool for FM wavetable pads."
        initialInstrumentType="synth"
        initialName="FM Pad Tool"
        initialSlug="fm-pad-tool"
      />,
    );

    expect(screen.getByLabelText("instrument")).toHaveValue("synth");
    expect(screen.getByLabelText("reference")).toHaveValue("evolving-fm-synth");
  });

  it("can render a locked specialized L2 builder entrypoint", () => {
    const plan = createBuilderProfilePlan({
      description: "Build synth tools from the specialized route.",
      domain: "synth",
    });

    render(
      <ToolBuilderClient
        builderDetail="Synth Scene Builder L2"
        builderPlan={plan}
        builderRoute="/build/synth"
        builderSlug="synth-builder"
        generatedAudit={emptyGeneratedAudit}
        initialDescription="Build an evolving synth tool."
        initialInstrumentType="synth"
        initialReferenceAgent="evolving-fm-synth"
        initialName="Evolving Synth Tool"
        initialSlug="evolving-synth-tool"
        lockInstrumentType
      />,
    );

    expect(screen.getAllByText(/synth-builder/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Synth Scene Builder L2/)).toBeInTheDocument();
    expect(screen.getByText("/build/synth")).toBeInTheDocument();
    expect(screen.getByLabelText("instrument")).toHaveValue("synth");
    expect(screen.getByLabelText("instrument")).toBeDisabled();
    expect(screen.getByLabelText("reference")).toHaveValue("evolving-fm-synth");
    expect(screen.getByLabelText("specialized builder profile")).toHaveTextContent(
      "synth-scene-tool-skeleton",
    );
  });

  it("sends the specialized builder profile with build requests", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createNdjsonResponse([]));
    const plan = createBuilderProfilePlan({
      description: "Build synth tools from the specialized route.",
      domain: "synth",
    });

    render(
      <ToolBuilderClient
        builderPlan={plan}
        initialDescription="Build an evolving synth tool."
        initialInstrumentType="synth"
        initialReferenceAgent="evolving-fm-synth"
        initialName="Evolving Synth Tool"
        initialSlug="evolving-synth-tool"
        lockInstrumentType
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /build/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const requestBody = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      instrumentType: "synth",
      referenceAgent: "evolving-fm-synth",
      builderSpecialization: {
        domain: "synth",
        builderSlug: "_synth-builder",
        targetInstrumentType: "synth",
        targetDocument: "synth-scene",
        targetWorkflow: "synth-scene",
        templateKit: "synth-scene-tool-skeleton",
        referenceAgent: "evolving-fm-synth",
      },
    });
  });

  it("rebuilds an existing generated tool through the edit endpoint", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createNdjsonResponse([]));

    render(
      <ToolBuilderClient
        editSlug="generated-stutter"
        initialDescription="Tighten the gate timing and keep the prompt controls."
        initialInstrumentType="sample"
        initialName="Generated Stutter"
        initialSlug="generated-stutter"
        mode="rebuild"
      />,
    );

    expect(screen.getByRole("heading", { name: "Rebuild a generated tool" })).toBeInTheDocument();
    expect(screen.getByLabelText("instrument")).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /rebuild/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/build/edit");
    const requestBody = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      description: "Tighten the gate timing and keep the prompt controls.",
      register: true,
      slug: "generated-stutter",
      tokenBudget: 50000,
    });
    expect(requestBody).not.toHaveProperty("name");
    expect(requestBody).not.toHaveProperty("builderSpecialization");
  });

  it("shows a loading overlay while the builder agent is running", async () => {
    let closeStream: () => void = () => undefined;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            closeStream = () => controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    render(<ToolBuilderClient />);

    await userEvent.click(screen.getByRole("button", { name: /build/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("building tool");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the builder agent and streaming tool files into the sandbox.",
    );

    closeStream();
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("streams L2 chunks into a staged builder run monitor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createNdjsonResponse([
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
        {
          type: "verification",
          name: "manifest",
          passed: true,
        },
        {
          type: "verification",
          name: "static",
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
          type: "verification",
          name: "audio-gate",
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
      ]),
    );

    render(<ToolBuilderClient />);

    await userEvent.click(screen.getByRole("button", { name: /build/i }));

    const monitor = screen.getByLabelText("builder run monitor");
    await waitFor(() => {
      expect(within(monitor).getByText("11/11 gates")).toBeInTheDocument();
    });
    expect(within(monitor).getAllByText("complete").length).toBeGreaterThan(0);
    expect(within(monitor).getByText(/Open the dashboard/)).toBeInTheDocument();
    expect(screen.getAllByText(/vocal-stutter registered/).length).toBeGreaterThan(0);
  });
});

const emptyGeneratedAudit = {
  byDocument: {},
  byInstrument: {},
  entries: [],
  generatedCount: 0,
  issues: [
    {
      detail: "Build and register an L1 tool to populate .audit/generated-tools.json.",
      id: "registry-empty",
      severity: "info",
    },
  ],
  readyCount: 0,
  status: "empty",
  summary: "No L2-generated tools are registered yet.",
} satisfies GeneratedToolAudit;

function createNdjsonResponse(chunks: BuilderStreamChunk[]) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}
