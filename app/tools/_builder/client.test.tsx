import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolBuilderClient } from "@/app/tools/_builder/client";

describe("ToolBuilderClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the builder controls and transparency panels", () => {
    render(<ToolBuilderClient />);

    expect(screen.getByText("tool-builder")).toBeInTheDocument();
    expect(screen.getByLabelText("description")).toBeInTheDocument();
    expect(screen.getByLabelText("instrument")).toBeInTheDocument();
    expect(screen.getByLabelText("token budget")).toBeInTheDocument();
    expect(screen.getByText("decisions")).toBeInTheDocument();
    expect(screen.getByText("alternatives not taken")).toBeInTheDocument();
    expect(screen.getByText("breach")).toBeInTheDocument();
    expect(screen.getByText("files produced")).toBeInTheDocument();
  });

  it("shows a loading overlay while the builder agent is running", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => undefined),
    );

    render(<ToolBuilderClient />);

    await userEvent.click(screen.getByRole("button", { name: /build/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("building tool");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the builder agent and streaming tool files into the sandbox.",
    );
  });
});
