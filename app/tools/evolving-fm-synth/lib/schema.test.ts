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
    expect(scene.voices.every((voice) => voice.patch.rootWaveform === "wavetable")).toBe(
      true,
    );
  });

  it("backfills older patch data to the wavetable root waveform", () => {
    const scene = createDefaultSynthScene();
    const legacyScene = {
      ...scene,
      voices: scene.voices.map((voice) => ({
        ...voice,
        patch: {
          partials: voice.patch.partials,
          modulationIndex: voice.patch.modulationIndex,
          harmonicity: voice.patch.harmonicity,
          modulationType: voice.patch.modulationType,
          detuneCents: voice.patch.detuneCents,
          attack: voice.patch.attack,
          decay: voice.patch.decay,
          sustain: voice.patch.sustain,
          release: voice.patch.release,
          modulationAttack: voice.patch.modulationAttack,
          modulationRelease: voice.patch.modulationRelease,
        },
      })),
    };

    const parsed = SynthSceneSchema.parse(legacyScene);

    expect(parsed.voices.every((voice) => voice.patch.rootWaveform === "wavetable")).toBe(
      true,
    );
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
