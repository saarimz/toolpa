import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ToolExportPanel } from "@/components/tool-export-panel";
import type { AgentManifest } from "@/lib/agents/contract";
import type { ExportArtifact } from "@/lib/tool-exports/artifact";

vi.mock("@/components/audio-output-recorder", () => ({
  AudioOutputRecorder: () => <button type="button">record output</button>,
}));

describe("ToolExportPanel", () => {
  it("downloads rendered audio artifacts and reports peak in dBFS", async () => {
    const user = userEvent.setup();
    const audioExport = vi.fn(async () => createAudioArtifact());
    render(
      <ToolExportPanel
        audioExport={audioExport}
        document={{ id: "render" }}
        filenameStem="render"
        manifest={audioManifest}
      />,
    );

    await user.click(screen.getByRole("button", { name: /download wav/i }));

    expect(audioExport).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.getByText("2.0s / peak -6.0 dBFS")).toBeInTheDocument();
    });
  });

  it("downloads declared MIDI artifacts and reports evidence", async () => {
    const user = userEvent.setup();
    const midiExport = vi.fn(() => createArtifact());
    render(
      <ToolExportPanel
        document={{ id: "clip" }}
        filenameStem="clip"
        manifest={manifest}
        midiExport={midiExport}
      />,
    );

    await user.click(screen.getByRole("button", { name: /download midi/i }));

    expect(midiExport).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.getByText("12 notes / 3 tracks")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /record output/i })).toBeInTheDocument();
  });
});

const manifest: AgentManifest = {
  autonomy: "assist",
  capabilities: ["exportMidi", "recordOutput"],
  description: "MIDI test tool.",
  exports: {
    document: "midi-clip",
    audio: {
      strategy: "live-recording",
      formats: ["wav"],
      maxDefaultDurationSec: 120,
      requiresUserGestureForPreview: true,
    },
    midi: {
      strategy: "standard-midi-file",
      format: "smf-1",
      ticksPerQuarter: 480,
      preservesTracks: true,
      supportsPitchBend: true,
      supportsCc: true,
    },
  },
  inputs: {
    bpm: true,
    description: false,
    globalBpm: true,
    globalKey: true,
    prompt: true,
    referenceAgent: false,
    requiredAnalysis: [],
    samples: [],
    scaleSearch: true,
  },
  instrument: {
    document: "midi-clip",
    type: "midi",
    usesSamples: false,
    usesSynthesis: true,
    workflow: "midi-generator",
  },
  level: 1,
  musicContext: {
    globalBpm: true,
    globalKey: true,
    scaleSearch: true,
  },
  name: "MIDI Tool",
  origin: "installed",
  outputs: {
    audio: true,
    files: false,
    manifest: false,
    midi: true,
    pattern: false,
    recording: true,
    synthScene: false,
  },
  route: "/tools/midi-tool",
  slug: "midi-tool",
  status: "enabled",
};

const audioManifest: AgentManifest = {
  ...manifest,
  capabilities: ["exportAudio"],
  exports: {
    document: "audio-stream",
    audio: {
      strategy: "offline-render",
      formats: ["wav"],
      maxDefaultDurationSec: 120,
      requiresUserGestureForPreview: true,
    },
  },
  outputs: {
    ...manifest.outputs,
    midi: false,
    recording: false,
  },
};

function createArtifact(): ExportArtifact {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    evidence: {
      noteCount: 12,
      ok: true,
      reasons: [],
      trackCount: 3,
    },
    filename: "clip.mid",
    kind: "audio/midi",
    source: {
      documentHash: "abc",
      documentId: "clip",
      documentKind: "midi-clip",
      schemaVersion: 1,
      toolSlug: "midi-tool",
    },
  };
}

function createAudioArtifact(): ExportArtifact {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    evidence: {
      clippedRatio: 0,
      durationSec: 2,
      ok: true,
      peak: 10 ** (-6 / 20),
      reasons: [],
      rms: 0.12,
    },
    filename: "render.wav",
    kind: "audio/wav",
    source: {
      documentHash: "abc",
      documentId: "render",
      documentKind: "audio-stream",
      schemaVersion: 1,
      toolSlug: "midi-tool",
    },
  };
}
