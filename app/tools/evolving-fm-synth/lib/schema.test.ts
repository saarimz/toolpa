import { describe, expect, it } from "vitest";

import {
  SynthSceneSchema,
  keyToMidiRoot,
  midiToFrequency,
  midiToNoteName,
  normalizeKey,
  noteNameToMidi,
} from "./schema";
import { createDefaultSynthScene } from "./agent";

describe("evolving fm synth schema", () => {
  it("parses the default agent scene", () => {
    const scene = createDefaultSynthScene();

    expect(SynthSceneSchema.parse(scene)).toMatchObject({
      schemaVersion: 1,
      key: "C",
      scale: "dorian",
    });
    expect(scene.voices).toHaveLength(5);
    expect(scene.voices.every((voice) => voice.patch.partials.length >= 4)).toBe(true);
  });

  it("normalizes keys and converts MIDI note names", () => {
    expect(normalizeKey("bb")).toBe("Bb");
    expect(keyToMidiRoot("Bb", 2)).toBe(46);
    expect(noteNameToMidi("C4")).toBe(60);
    expect(noteNameToMidi("Bb2")).toBe(46);
    expect(midiToNoteName(46)).toBe("A#2");
    expect(Math.round(midiToFrequency(69))).toBe(440);
    expect(Math.round(midiToFrequency(69, 50))).toBe(453);
  });
});
