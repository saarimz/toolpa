import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SamplePicker, type PickedSample } from "@/components/sample-picker";

vi.mock("@/lib/samples/analysis", () => ({
  getSampleSchema: vi.fn(async () => ({
    global: {
      lufs_integrated: -12,
      true_peak_dbfs: -1,
    },
    llm_descriptors: null,
    rhythm: {
      bpm: null,
      bpm_confidence: 0,
      onsets_s: [],
    },
    role: null,
    role_confidence: 0,
    slices: [],
    tonal: {
      key: null,
      key_strength: 0,
      scale: null,
    },
  })),
}));

vi.mock("@/lib/samples/analysis/library-cache", () => ({
  hasLibraryAnalysis: vi.fn(() => false),
}));

vi.mock("@/lib/samples/resolver", () => ({
  resolveSample: vi.fn(async (sampleId: string) => ({
    id: sampleId,
    name: "sample",
    origin: sampleId.startsWith("library:") ? "library" : "upload",
    audioBuffer: {
      duration: 2,
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 8,
      getChannelData: () =>
        Float32Array.from([0, 0.25, -0.5, 1, -1, 0.25, 0, 0.75]),
    },
  })),
}));

describe("SamplePicker", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
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

  it("shows the selected sample full waveform and duration", async () => {
    render(
      <SamplePicker
        id="sample"
        label="source"
        value="library:element-one/140-stripped-drum-loop-03"
        roles={["loop", "pad"]}
        onSelect={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("img", {
        name: /full waveform, 2\.00s \/ 44\.1 kHz \/ 1 ch/i,
      }),
    ).toBeInTheDocument();
  });
});
