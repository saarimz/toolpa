import { describe, expect, it } from "vitest";

import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import { createSynthSceneFromMidiFile } from "@/app/tools/evolving-fm-synth/lib/midi-import";
import { encodeMidiFile } from "@/lib/midi/export";

describe("Evolving FM Synth MIDI import", () => {
  it("maps Standard MIDI File tracks into SynthScene voices", () => {
    const currentScene = createDefaultSynthScene("F minor 124 bpm");
    const bytes = encodeMidiFile({
      bpm: 96,
      format: 1,
      name: "Imported Idea",
      tracks: [
        {
          name: "bass",
          notes: [{ channel: 0, midi: 36, startBeat: 0, durationBeats: 1, velocity: 0.8 }],
        },
        {
          name: "lead",
          notes: [{ channel: 1, midi: 72, startBeat: 1, durationBeats: 0.5, velocity: 0.7 }],
        },
      ],
    });

    const scene = createSynthSceneFromMidiFile(bytes, currentScene);

    expect(scene.bpm).toBe(96);
    expect(scene.metadata.createdBy).toBe("import");
    expect(scene.voices).toHaveLength(2);
    expect(scene.voices[0]).toMatchObject({ label: "bass", role: "bass" });
    expect(scene.voices[1]).toMatchObject({ label: "lead", role: "lead" });
    expect(scene.voices[0]?.steps.some((step) => step.active && step.midi === 36)).toBe(true);
    expect(scene.voices[1]?.steps.some((step) => step.active && step.midi === 72)).toBe(true);
  });
});

