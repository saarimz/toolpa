import { describe, expect, it } from "vitest";

import { generateMidiClipFromPrompt } from "@/app/tools/midi-generator/lib/agent";
import {
  createMidiClipExportInput,
  createMidiClipPlayback,
  encodeMidiClipToMidi,
  getMidiClipFilename,
} from "@/app/tools/midi-generator/lib/export";
import { parseMidiFileSummary } from "@/lib/midi/parse";

describe("midi clip export", () => {
  it("adapts MIDI clips into Standard MIDI export and piano-roll playback", () => {
    const clip = generateMidiClipFromPrompt({
      prompt: "4 bar F minor expressive chords and lead at 124 bpm",
      seed: 81,
    });
    const exportInput = createMidiClipExportInput(clip);
    const bytes = encodeMidiClipToMidi(clip);
    const playback = createMidiClipPlayback(clip);

    expect(exportInput).toMatchObject({
      bpm: 124,
      format: 1,
      name: clip.name,
    });
    expect(exportInput.tracks?.length).toBe(clip.tracks.length);
    expect(exportInput.notes?.length).toBe(clip.notes.length);
    expect(String.fromCharCode(...bytes)).toContain("MThd");
    expect(parseMidiFileSummary(bytes)).toMatchObject({
      format: 1,
      trackCount: clip.tracks.length + 1,
      valid: true,
    });
    expect(playback.totalBeats).toBe(16);
    expect(playback.notes[0]).toEqual(
      expect.objectContaining({
        durationBeats: expect.any(Number),
        midi: expect.any(Number),
        startBeat: expect.any(Number),
      }),
    );
    expect(getMidiClipFilename({ id: "clip", name: "My MIDI Clip" })).toBe(
      "my-midi-clip.mid",
    );
  });
});
