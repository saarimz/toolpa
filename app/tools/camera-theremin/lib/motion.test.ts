import { describe, expect, it } from "vitest";

import {
  createHandMotionFrame,
  getTonicFrequency,
  quantizeMotionToScale,
  smoothHandMotionFrame,
  type MotionLandmark,
} from "@/app/tools/camera-theremin/lib/motion";

describe("camera theremin motion mapping", () => {
  it("extracts index-tip motion and pinch distance from hand landmarks", () => {
    const frame = createHandMotionFrame({
      handedness: "Right",
      landmarks: landmarksWith({
        4: { x: 0.4, y: 0.5, z: -0.02 },
        8: { x: 0.55, y: 0.25, z: -0.08 },
      }),
      score: 0.91,
    });

    expect(frame).toMatchObject({
      handedness: "Right",
      score: 0.91,
      x: 0.55,
      y: 0.25,
    });
    expect(frame?.pinch).toBeCloseTo(0.298, 3);
  });

  it("locks vertical motion to degrees in the selected scale", () => {
    const frame = createHandMotionFrame({
      landmarks: landmarksWith({
        4: { x: 0.3, y: 0.2, z: -0.02 },
        8: { x: 0.5, y: 0.5, z: -0.05 },
      }),
    });

    expect(frame).not.toBeNull();
    const major = quantizeMotionToScale(frame!, {
      degreeSpan: 4,
      octaveShift: 0,
      referenceFrequency: 440,
      scaleId: "major",
      tonic: "C",
    });
    const minor = quantizeMotionToScale(frame!, {
      degreeSpan: 4,
      octaveShift: 0,
      referenceFrequency: 440,
      scaleId: "minor",
      tonic: "C",
    });

    expect(major.degree).toBe(2);
    expect(major.detuneCents).toBe(0);
    expect(major.frequency).toBeCloseTo(329.628, 3);
    expect(major.frequencies).toEqual([329.628]);
    expect(minor.frequency).toBeCloseTo(311.128, 3);
    expect(minor.scaleLabel).toBe("C Natural minor");
  });

  it("builds scale-locked chords from degree offsets", () => {
    const frame = createHandMotionFrame({
      landmarks: landmarksWith({
        4: { x: 0.3, y: 0.2, z: -0.02 },
        8: { x: 0.5, y: 0.5, z: -0.05 },
      }),
    });

    expect(frame).not.toBeNull();
    const note = quantizeMotionToScale(frame!, {
      chordMode: "triad",
      degreeSpan: 4,
      octaveShift: 0,
      referenceFrequency: 440,
      scaleId: "major",
      tonic: "C",
    });

    expect(note.chordMode).toBe("triad");
    expect(note.chordDegrees).toEqual([2, 4, 6]);
    expect(note.frequencies[0]).toBeCloseTo(329.628, 3);
    expect(note.frequencies[1]).toBeCloseTo(391.996, 3);
    expect(note.frequencies[2]).toBeCloseTo(493.884, 3);
    expect(note.chordLabel).toBe("degree 3 triad");
  });

  it("supports microtonal scales without reducing them to chromatic semitones", () => {
    const frame = createHandMotionFrame({
      landmarks: landmarksWith({
        4: { x: 0.3, y: 0.2, z: -0.02 },
        8: { x: 0.5, y: 0.75, z: -0.05 },
      }),
    });

    expect(frame).not.toBeNull();
    const note = quantizeMotionToScale(frame!, {
      degreeSpan: 4,
      octaveShift: 0,
      referenceFrequency: 440,
      scaleId: "quarter-tone-neutral",
      tonic: "A",
    });

    expect(note.degree).toBe(1);
    expect(note.frequency).toBeCloseTo(479.823, 3);
    expect(note.detuneCents).toBe(-50);
    expect(note.noteLabel).toContain("24-EDO neutral mode");
  });

  it("smooths motion with a bounded exponential hold", () => {
    const previous = createHandMotionFrame({
      landmarks: landmarksWith({
        4: { x: 0, y: 0, z: 0 },
        8: { x: 0.2, y: 0.8, z: 0 },
      }),
    });
    const next = createHandMotionFrame({
      landmarks: landmarksWith({
        4: { x: 1, y: 1, z: 0 },
        8: { x: 0.8, y: 0.2, z: 0 },
      }),
    });

    expect(previous).not.toBeNull();
    expect(next).not.toBeNull();
    const smoothed = smoothHandMotionFrame(previous, next!, 0.5);

    expect(smoothed.x).toBe(0.5);
    expect(smoothed.y).toBe(0.5);
  });

  it("honors reference tuning for the tonic frequency", () => {
    expect(getTonicFrequency("A", 440)).toBe(440);
    expect(getTonicFrequency("A", 432)).toBe(432);
  });
});

function landmarksWith(overrides: Record<number, MotionLandmark>): MotionLandmark[] {
  return Array.from({ length: 21 }, (_, index) => ({
    x: overrides[index]?.x ?? 0,
    y: overrides[index]?.y ?? 0,
    z: overrides[index]?.z ?? 0,
  }));
}
