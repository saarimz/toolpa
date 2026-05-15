import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiClippy } from "@/components/gemini-clippy";

describe("GeminiClippy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders the draggable character without an extra waveform overlay", () => {
    render(<GeminiClippy />);

    const assistant = screen.getByRole("button", {
      name: "Open Little Toolpa",
    });

    expect(assistant).toHaveAttribute("data-bursting", "false");
    expect(assistant).toHaveAttribute("data-dragging", "false");
    expect(assistant.querySelector(".gemini-clippy-character")).toHaveAttribute(
      "src",
      "/gemini-clippy.svg",
    );
    expect(assistant.querySelectorAll(".gemini-clippy-waveform-bar")).toHaveLength(0);
  });

  it("opens the producer copilot on click and resets the burst animation", async () => {
    vi.useFakeTimers();

    render(<GeminiClippy />);
    const assistant = screen.getByRole("button", {
      name: "Open Little Toolpa",
    });

    fireEvent.pointerDown(assistant, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerUp(assistant, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });

    expect(screen.getByRole("dialog", { name: "Little Toolpa" })).toBeInTheDocument();
    expect(screen.getByText("Little Toolpa")).toBeInTheDocument();
    expect(assistant).toHaveAttribute("data-bursting", "true");
    expect(assistant.querySelectorAll(".gemini-clippy-spark")).toHaveLength(8);

    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(assistant).toHaveAttribute("data-bursting", "false");
  });

  it("drags the launcher without opening chat", () => {
    render(<GeminiClippy />);
    const assistant = screen.getByRole("button", {
      name: "Open Little Toolpa",
    });
    const shell = assistant.closest(".gemini-clippy-shell");
    expect(shell).not.toBeNull();
    if (!shell) {
      throw new Error("launcher shell was not rendered");
    }

    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      bottom: 212,
      height: 112,
      left: 100,
      right: 212,
      top: 100,
      width: 112,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(assistant, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(assistant, {
      clientX: 145,
      clientY: 130,
      pointerId: 1,
    });
    fireEvent.pointerUp(assistant, {
      clientX: 145,
      clientY: 130,
      pointerId: 1,
    });

    expect(screen.queryByRole("dialog", { name: "Little Toolpa" })).not.toBeInTheDocument();
    expect(shell).toHaveStyle({ left: "145px", top: "130px" });
  });

  it("sends chat messages to the copilot API with enter", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        message: {
          role: "assistant",
          content: "Use /tools/midi-generator for chords, then render the idea.",
        },
      }),
    );

    render(<GeminiClippy />);
    const assistant = screen.getByRole("button", {
      name: "Open Little Toolpa",
    });

    fireEvent.keyDown(assistant, { key: "Enter" });
    await userEvent.type(
      screen.getByLabelText("Message Little Toolpa"),
      "How should I sketch chords?{enter}",
    );

    await waitFor(() => {
      expect(
        screen.getByText("Use /tools/midi-generator for chords, then render the idea."),
      ).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/copilot",
      expect.objectContaining({
        body: expect.stringContaining("How should I sketch chords?"),
        method: "POST",
      }),
    );
  });
});
