import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SampleAnalysisClient } from "@/app/tools/sample-analysis/client";
import {
  SAMPLE_ANALYSIS_SCHEMA_VERSION,
  type LlmDescriptors,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";

const analysisMock = vi.hoisted(() => ({
  getSampleSchema: vi.fn(),
}));

const playbackMock = vi.hoisted(() => ({
  startSamplePlaybackSlice: vi.fn(),
}));

vi.mock("@/components/sample-picker", () => ({
  SamplePicker: ({
    onSelect,
    value,
  }: {
    onSelect: (sample: {
      id: string;
      name: string;
      origin: "library" | "upload";
      role: string;
    }) => void;
    value: string;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          id: "upload:test-loop",
          name: "test loop.wav",
          origin: "upload",
          role: "loop",
        })
      }
    >
      sample picker {value}
    </button>
  ),
}));

vi.mock("@/components/audio-output-recorder", () => ({
  AudioOutputRecorder: () => <div>recorder</div>,
}));

vi.mock("@/lib/audio/sample-playback", () => ({
  startSamplePlaybackSlice: playbackMock.startSamplePlaybackSlice,
}));

vi.mock("@/lib/samples/analysis", () => ({
  getSampleSchema: analysisMock.getSampleSchema,
}));

describe("SampleAnalysisClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    analysisMock.getSampleSchema.mockImplementation(
      async (
        _sampleId: string,
        options?: { waitForDescriptors?: boolean; enrichDescriptors?: boolean },
      ) =>
        options?.waitForDescriptors
          ? makeAnalysis({
              mood: ["driving"],
              suggested_genres: ["techno"],
              timbre: ["gritty"],
              use_case: ["transition loop"],
            })
          : makeAnalysis(),
    );
    playbackMock.startSamplePlaybackSlice.mockResolvedValue(createAuditionHandle());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ideas: {
            ideas: Array.from({ length: 5 }, (_, index) => ({
              title: `Idea ${index + 1}`,
              approach: "Use it as a chopped transition phrase.",
              complement: "Pair it with a dry kick and sub pulse.",
              productionMove: "Gate the tail and send it through slot A delay.",
            })),
          },
        }),
      ),
    );
  });

  it("analyzes a selected sample and renders five structured ideas", async () => {
    const user = userEvent.setup();
    render(<SampleAnalysisClient />);

    await user.click(screen.getByText(/sample picker/i));
    await user.clear(screen.getByLabelText("intent prompt"));
    await user.type(screen.getByLabelText("intent prompt"), "use this as an opener");
    await user.click(screen.getByRole("button", { name: /^analyze$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Idea 1/)).toBeInTheDocument();
    });

    expect(analysisMock.getSampleSchema).toHaveBeenCalledWith("upload:test-loop", {
      enrichDescriptors: false,
      waitForDescriptors: false,
    });
    expect(analysisMock.getSampleSchema).toHaveBeenCalledWith("upload:test-loop", {
      waitForDescriptors: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/sample-analysis",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"task":"ideas"'),
      }),
    );
    expect(screen.getAllByText(/Gate the tail/i)).toHaveLength(5);
    expect(screen.getByText(/gritty/i)).toBeInTheDocument();
  });

  it("auditions the full current source sample and exposes a stop state", async () => {
    const handle = createAuditionHandle();
    playbackMock.startSamplePlaybackSlice.mockResolvedValueOnce(handle);
    const user = userEvent.setup();
    render(<SampleAnalysisClient />);

    await user.click(screen.getByRole("button", { name: /play sample/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop sample/i })).toBeInTheDocument();
    });
    expect(playbackMock.startSamplePlaybackSlice).toHaveBeenCalledWith(
      expect.stringMatching(/^library:/),
      0,
      { sliceCount: 1 },
    );

    await user.click(screen.getByRole("button", { name: /stop sample/i }));

    expect(handle.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /play sample/i })).toBeInTheDocument();
  });

  it("returns the play button when sample audition finishes naturally", async () => {
    const handle = createAuditionHandle();
    playbackMock.startSamplePlaybackSlice.mockResolvedValueOnce(handle);
    const user = userEvent.setup();
    render(<SampleAnalysisClient />);

    await user.click(screen.getByRole("button", { name: /play sample/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop sample/i })).toBeInTheDocument();
    });

    handle.finish();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /play sample/i })).toBeInTheDocument();
    });
  });

  it("stops the current audition when the selected sample changes", async () => {
    const handle = createAuditionHandle();
    playbackMock.startSamplePlaybackSlice.mockResolvedValueOnce(handle);
    const user = userEvent.setup();
    render(<SampleAnalysisClient />);

    await user.click(screen.getByRole("button", { name: /play sample/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop sample/i })).toBeInTheDocument();
    });
    await user.click(screen.getByText(/sample picker/i));

    expect(handle.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /play sample/i })).toBeInTheDocument();
  });
});

function createAuditionHandle() {
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const handle = {
    durationSec: 8,
    finished,
    finish,
    stop: vi.fn(() => finish()),
  };

  return handle;
}

function makeAnalysis(descriptors: LlmDescriptors | null = null): SampleAnalysis {
  return {
    schema_version: SAMPLE_ANALYSIS_SCHEMA_VERSION,
    analyzed_at: 1700000000000,
    beats: [],
    envelope: {
      attack_ms: 12,
      decay_t60_ms: 220,
      peak_position_frac: 0.2,
    },
    global: {
      crest_factor_db: 8,
      dc_offset: 0,
      is_silent: false,
      lufs_integrated: -12,
      rms_dbfs: -14,
      stereo_width: 0.4,
      true_peak_dbfs: -1,
    },
    llm_descriptors: descriptors,
    pipeline_version: "test",
    rhythm: {
      beat_offset_s: null,
      bpm: 124,
      bpm_confidence: 0.8,
      onset_rate_hz: 2,
      onsets_s: [0, 0.5, 1],
      swing_ratio: null,
    },
    role: "loop",
    role_confidence: 0.9,
    slices: [],
    source: {
      channels: 2,
      duration_s: 4,
      sample_rate: 44100,
      sha256: "a".repeat(64),
    },
    spectral: {
      centroid_hz: { max: 2000, mean: 1100, min: 200, std: 200 },
      flatness: { max: 0.4, mean: 0.2, min: 0.1, std: 0.05 },
      flux: { max: 0.8, mean: 0.3, min: 0.1, std: 0.1 },
      mfcc_mean: Array.from({ length: 13 }, () => 0),
      mfcc_std: Array.from({ length: 13 }, () => 1),
      rolloff85_hz: { max: 5000, mean: 3200, min: 1000, std: 400 },
    },
    tags: null,
    tonal: {
      chroma_mean: Array.from({ length: 12 }, () => 1 / 12),
      key: "C",
      key_strength: 0.7,
      scale: "minor",
      tuning_hz: 440,
    },
  };
}
