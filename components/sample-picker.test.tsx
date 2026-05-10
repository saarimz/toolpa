import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SamplePicker, type PickedSample } from "@/components/sample-picker";

describe("SamplePicker", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("ai-daw-tools-samples");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });

  it("selects library sounds and persists uploaded sounds", async () => {
    const onSelect = vi.fn<(sample: PickedSample) => void>();
    const user = userEvent.setup();

    render(
      <SamplePicker
        id="sample"
        label="source"
        value="library:element-one/140-stripped-drum-loop-03"
        roles={["loop", "pad"]}
        onSelect={onSelect}
      />,
    );

    await user.selectOptions(screen.getByLabelText("source"), "library:zero-g/glasychord");
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "library:zero-g/glasychord",
        role: "pad",
        origin: "library",
      }),
    );

    await user.upload(
      screen.getByLabelText(/upload/i),
      new File(["abc"], "user pad.wav", {
        type: "audio/wav",
        lastModified: 99,
      }),
    );

    await waitFor(() => {
      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: "upload:user-pad-3-99",
          name: "user pad.wav",
          role: "unknown",
          origin: "upload",
        }),
      );
    });
  });
});
