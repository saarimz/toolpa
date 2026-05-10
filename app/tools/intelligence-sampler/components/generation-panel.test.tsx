import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GenerationPanel } from "@/app/tools/intelligence-sampler/components/generation-panel";
import { useIntelligenceSamplerStore } from "@/app/tools/intelligence-sampler/store";
import { createIntelligenceSamplerPattern } from "@/lib/pattern/defaults";

describe("GenerationPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("makes active generation capabilities and locked controls clear", async () => {
    const pattern = createIntelligenceSamplerPattern(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    useIntelligenceSamplerStore.setState({
      pattern,
      sampleId: "library:jungle/let-there-break",
      sampleName: "Let There Break",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/suggestions")) {
        return Promise.resolve(
          Response.json({
            suggestions: [
              "push hats late with ghosted amen cuts",
              "alternate snares every two bars",
              "answer sparse bars with reversed slices",
            ],
          }),
        );
      }

      if (url.includes("/api/generate")) {
        return new Promise<Response>(() => undefined);
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<GenerationPanel />);

    await waitFor(() => {
      expect(screen.getByText("push hats late with ghosted amen cuts")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    expect(screen.getByRole("status")).toHaveTextContent("generating pattern");
    expect(screen.getByRole("status")).toHaveTextContent("abort, copy JSON, play current grid");
    expect(screen.getByRole("status")).toHaveTextContent(
      "prompt edits, suggestion chips, new generate",
    );
    expect(screen.getByLabelText(/generation prompt/i)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "push hats late with ghosted amen cuts" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /abort/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /copy json/i })).toBeEnabled();
  });
});
