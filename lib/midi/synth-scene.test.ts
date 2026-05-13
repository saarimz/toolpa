import { describe, expect, it } from "vitest";

import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import { SynthSceneSchema } from "@/app/tools/evolving-fm-synth/lib/schema";
import {
  collectSynthSceneMidiNotes,
  createSynthSceneMidiExport,
  encodeSynthSceneToMidi,
  getSynthSceneMidiFilename,
} from "@/lib/midi/synth-scene";
import { parseMidiFileSummary } from "@/lib/midi/parse";

describe("SynthScene MIDI export", () => {
  it("converts active SynthScene steps into beat-timed MIDI notes", () => {
    const scene = SynthSceneSchema.parse({
      ...createDefaultSynthScene("F minor 124 bpm over 4 bars evolving pads"),
      name: "Micro Pad",
      voices: createDefaultSynthScene("F minor 124 bpm over 4 bars evolving pads").voices.map(
        (voice, voiceIndex) => ({
          ...voice,
          steps: voice.steps.map((step, stepIndex) =>
            voiceIndex === 0 && stepIndex === 0
              ? {
                  ...step,
                  active: true,
                  midi: 61,
                  tuningCents: 31,
                  velocity: 0.7,
                }
              : step,
          ),
        }),
      ),
    });

    const notes = collectSynthSceneMidiNotes(scene);
    const exportInput = createSynthSceneMidiExport(scene);
    const midi = encodeSynthSceneToMidi(scene);
    const firstNote = notes.find((note) => note.midi === 61);

    expect(notes.length).toBeGreaterThan(0);
    expect(firstNote).toMatchObject({
      channel: 0,
      midi: 61,
      pitchBendCents: 31,
      startBeat: 0,
      velocity: 0.7,
    });
    expect(notes.every((note) => note.startBeat >= 0)).toBe(true);
    expect(notes.every((note) => note.durationBeats > 0)).toBe(true);
    expect(exportInput).toMatchObject({ bpm: scene.bpm, format: 1, name: "Micro Pad" });
    expect(exportInput.tracks?.length).toBe(scene.voices.length);
    expect(String.fromCharCode(...midi)).toContain("MThd");
    expect(Array.from(midi)).toEqual(expect.arrayContaining([0x90, 61]));
    expect(parseMidiFileSummary(midi)).toMatchObject({
      format: 1,
      trackCount: scene.voices.length + 1,
      valid: true,
    });
    expect(getSynthSceneMidiFilename(scene)).toBe("micro-pad.mid");
  });
});
