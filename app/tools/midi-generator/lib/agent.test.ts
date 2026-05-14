import { describe, expect, it } from "vitest";

import {
  editMidiClipWithPrompt,
  generateMidiClipFromPrompt,
  inferContextPatch,
  inferMidiGenerationMode,
  inferMidiStyleProfile,
} from "@/app/tools/midi-generator/lib/agent";

describe("midi generator local agent", () => {
  it("generates an expressive MIDI clip from prompt and global context", () => {
    const clip = generateMidiClipFromPrompt({
      musicalContext: {
        bpm: 138,
        key: { referenceFrequency: 440, scaleId: "dorian", tonic: "F" },
        swing: 0.08,
      },
      prompt: "8 bar garage bassline with ghost notes and slides",
      seed: 12,
    });

    expect(clip.bars).toBe(8);
    expect(clip.bpm).toBe(138);
    expect(clip.key).toBe("F");
    expect(clip.scaleId).toBe("dorian");
    expect(clip.metadata.generationMode).toBe("bassline");
    expect(clip.metadata.styleProfile).toBe("groove-forward");
    expect(clip.tracks.map((track) => track.role)).toEqual(["bass"]);
    expect(clip.notes.length).toBeGreaterThan(16);
    expect(clip.notes.some((note) => note.pitchBendCents !== 0 || note.cc.length > 0)).toBe(
      true,
    );
    expect(clip.metadata.rationale).toContain("humanized starts");
  });

  it("lets prompt overrides control BPM, key, scale, swing, and long MIDI lengths", () => {
    const clip = generateMidiClipFromPrompt({
      musicalContext: {
        bpm: 120,
        key: { referenceFrequency: 440, scaleId: "minor", tonic: "C" },
        swing: 0,
      },
      prompt: "1024 bars in A phrygian at 172 bpm swung sparse evolving arp",
      seed: 99,
    });

    expect(clip.bars).toBe(1024);
    expect(clip.bpm).toBe(172);
    expect(clip.key).toBe("A");
    expect(clip.scaleId).toBe("phrygian");
    expect(clip.swing).toBeGreaterThan(0);
    expect(clip.notes.length).toBeLessThanOrEqual(4096);
  });

  it("uses part focus to generate melody, harmony, bassline, rhythm, and arpeggio contracts", () => {
    const harmony = generateMidiClipFromPrompt({
      generationMode: "harmony",
      prompt: "4 bar C minor lead and bass idea",
      seed: 1,
    });
    expect(harmony.metadata.generationMode).toBe("harmony");
    expect(harmony.tracks.map((track) => track.role)).toEqual(["chord"]);
    expect(new Set(harmony.notes.map((note) => note.trackId))).toEqual(new Set(["chord"]));

    const melody = generateMidiClipFromPrompt({
      generationMode: "melody",
      prompt: "4 bar C minor chord progression",
      seed: 2,
    });
    expect(melody.metadata.generationMode).toBe("melody");
    expect(melody.tracks.map((track) => track.role)).toEqual(["lead"]);

    const rhythm = generateMidiClipFromPrompt({
      generationMode: "rhythm",
      prompt: "4 bar modal percussive pattern",
      seed: 3,
    });
    expect(rhythm.metadata.generationMode).toBe("rhythm");
    expect(rhythm.tracks).toEqual([
      expect.objectContaining({ channel: 9, role: "drum" }),
    ]);
    expect(rhythm.notes.every((note) => note.channel === 9)).toBe(true);

    const arpeggio = generateMidiClipFromPrompt({
      generationMode: "arpeggio",
      styleProfile: "minimal-cyclic",
      prompt: "4 bar repetitive structure",
      seed: 4,
    });
    expect(arpeggio.metadata.generationMode).toBe("arpeggio");
    expect(arpeggio.metadata.styleProfile).toBe("minimal-cyclic");
    expect(arpeggio.tracks.map((track) => track.role)).toEqual(["arp"]);
    expect(arpeggio.notes.length).toBeGreaterThan(melody.notes.length);
  });

  it("maps named references into abstract style profiles without exposing composer modes", () => {
    expect(inferMidiStyleProfile("quiet Morton Feldman like floating fragments")).toBe(
      "spacious-pointillist",
    );
    expect(inferMidiStyleProfile("fourth world hand percussion and modal folk")).toBe(
      "organic-hybrid",
    );
    expect(inferMidiStyleProfile("Philip Glass style arpeggio")).toBe("minimal-cyclic");
    expect(inferMidiGenerationMode("Philip Glass style arpeggio")).toBe("arpeggio");

    const spacious = generateMidiClipFromPrompt({
      generationMode: "melody",
      prompt: "8 bar quiet Morton Feldman like floating fragments",
      seed: 5,
    });
    expect(spacious.metadata.styleProfile).toBe("spacious-pointillist");
    expect(spacious.notes.length).toBeLessThan(10);

    const organic = generateMidiClipFromPrompt({
      generationMode: "rhythm",
      prompt: "8 bar fourth world hand percussion and woodwind ritual",
      seed: 6,
    });
    expect(organic.metadata.styleProfile).toBe("organic-hybrid");
    expect(organic.beatsPerBar).toBe(5);
  });

  it("edits an existing clip without losing the MIDI clip contract", () => {
    const first = generateMidiClipFromPrompt({
      prompt: "4 bar C minor expressive lead",
      seed: 44,
    });
    const edited = editMidiClipWithPrompt(
      first,
      "transpose up 2 semitones, make it more human and louder",
    );

    expect(edited.id).toBe(first.id);
    expect(edited.seed).not.toBe(first.seed);
    expect(edited.metadata.history).toContain(
      "transpose up 2 semitones, make it more human and louder",
    );
    expect(edited.notes[0]?.midi).not.toBe(first.notes[0]?.midi);
    expect(averageVelocity(edited)).toBeGreaterThan(averageVelocity(first));
  });

  it("extracts global context mutations from prompts", () => {
    expect(inferContextPatch("in Bb melodic minor at 96 bpm straight")).toMatchObject({
      bpm: 96,
      key: { scaleId: "melodic-minor", tonic: "Bb" },
      swing: 0,
    });
  });
});

function averageVelocity(clip: { notes: Array<{ velocity: number }> }) {
  return clip.notes.reduce((total, note) => total + note.velocity, 0) / clip.notes.length;
}
