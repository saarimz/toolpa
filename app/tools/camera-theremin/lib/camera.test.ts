import { describe, expect, it, vi } from "vitest";
import type {
  Category,
  FaceLandmarkerResult,
  GestureRecognizerResult,
  HandLandmarkerResult,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

import {
  createFrameFromFaceLandmarkerResult,
  createFrameFromGestureRecognizerResult,
  createFrameFromPoseLandmarkerResult,
  createFrameFromResult,
  runWithMediaPipeConsoleNoiseSuppressed,
} from "@/app/tools/camera-theremin/lib/camera";

describe("camera hand-tracking adapter", () => {
  it("normalizes MediaPipe hand landmarker results into two-hand theremin frames", () => {
    const result = {
      handedness: [
        [{ categoryName: "Left", displayName: "Left", index: 0, score: 0.84 }],
        [{ categoryName: "Right", displayName: "Right", index: 1, score: 0.91 }],
      ],
      handednesses: [
        [{ categoryName: "Left", displayName: "Left", index: 0, score: 0.84 }],
        [{ categoryName: "Right", displayName: "Right", index: 1, score: 0.91 }],
      ],
      landmarks: [
        Array.from({ length: 21 }, (_, index) => ({
          visibility: 1,
          x: index === 8 ? 0.72 : index === 4 ? 0.52 : 0.1,
          y: index === 8 ? 0.24 : index === 4 ? 0.42 : 0.1,
          z: index === 8 ? -0.06 : 0,
        })),
        Array.from({ length: 21 }, (_, index) => ({
          visibility: 1,
          x: index === 8 ? 0.28 : index === 4 ? 0.36 : 0.2,
          y: index === 8 ? 0.58 : index === 4 ? 0.72 : 0.2,
          z: index === 8 ? -0.04 : 0,
        })),
      ],
      worldLandmarks: [],
    } satisfies HandLandmarkerResult;

    const frame = createFrameFromResult(result);

    expect(frame?.source).toBe("hands");
    expect(frame?.hands).toHaveLength(2);
    expect(frame?.volumeHand).toMatchObject({
      handedness: "Left",
      score: 0.84,
      x: 0.72,
      y: 0.24,
    });
    expect(frame?.pitchHand).toMatchObject({
      handedness: "Right",
      score: 0.91,
      x: 0.28,
      y: 0.58,
    });
    expect(frame?.pitchHand?.landmarks).toHaveLength(21);
    expect(frame?.volumeHand?.pinch).toBeGreaterThan(0.25);
  });

  it("maps gesture recognizer results into hand frames with gesture articulation", () => {
    const result = {
      gestures: [[category("Closed_Fist", 0.92)]],
      handedness: [[category("Right", 0.88)]],
      handednesses: [[category("Right", 0.88)]],
      landmarks: [
        landmarksWith(21, {
          4: { x: 0.42, y: 0.42, z: -0.02 },
          8: { x: 0.62, y: 0.22, z: -0.04 },
        }),
      ],
      worldLandmarks: [],
    } satisfies GestureRecognizerResult;

    const frame = createFrameFromGestureRecognizerResult(result);

    expect(frame?.source).toBe("gestures");
    expect(frame?.pitchHand).toMatchObject({
      gesture: "Closed_Fist",
      label: "closed fist",
      pinch: 0.02,
      source: "gestures",
    });
  });

  it("adapts face landmarks into head pitch and mouth volume controls", () => {
    const result = {
      faceBlendshapes: [
        {
          categories: [
            category("jawOpen", 0.72),
            category("mouthSmileLeft", 0.42),
            category("mouthSmileRight", 0.38),
          ],
          headIndex: 0,
          headName: "face",
        },
      ],
      faceLandmarks: [
        landmarksWith(478, {
          1: { x: 0.44, y: 0.36, z: -0.04 },
          13: { x: 0.45, y: 0.58, z: -0.02 },
          14: { x: 0.45, y: 0.66, z: -0.02 },
        }),
      ],
      facialTransformationMatrixes: [],
    } satisfies FaceLandmarkerResult;

    const frame = createFrameFromFaceLandmarkerResult(result, "face");

    expect(frame?.source).toBe("face");
    expect(frame?.pitchHand).toMatchObject({
      label: "head",
      role: "pitch",
      x: 0.44,
      y: 0.36,
    });
    expect(frame?.volumeHand).toMatchObject({
      label: "mouth",
      role: "volume",
      x: 1,
      y: 0.28,
    });
    expect(frame?.volumeHand?.pinch).toBeGreaterThan(0.2);
  });

  it("adapts eye landmarks into gaze pitch and blink volume controls", () => {
    const result = {
      faceBlendshapes: [
        {
          categories: [
            category("eyeBlinkLeft", 0.82),
            category("eyeBlinkRight", 0.76),
          ],
          headIndex: 0,
          headName: "face",
        },
      ],
      faceLandmarks: [
        landmarksWith(478, {
          33: { x: 0.32, y: 0.38, z: -0.02 },
          133: { x: 0.42, y: 0.38, z: -0.02 },
          362: { x: 0.58, y: 0.38, z: -0.02 },
          263: { x: 0.68, y: 0.38, z: -0.02 },
          468: { x: 0.39, y: 0.34, z: -0.03 },
          473: { x: 0.61, y: 0.35, z: -0.03 },
        }),
      ],
      facialTransformationMatrixes: [],
    } satisfies FaceLandmarkerResult;

    const frame = createFrameFromFaceLandmarkerResult(result, "eyes");

    expect(frame?.source).toBe("eyes");
    expect(frame?.pitchHand).toMatchObject({
      label: "gaze",
      role: "pitch",
      x: 0.5,
    });
    expect(frame?.volumeHand).toMatchObject({
      label: "blink",
      role: "volume",
    });
    expect(frame?.volumeHand?.pinch).toBeLessThan(0.1);
  });

  it("adapts pose landmarks into wrist-controlled body mode", () => {
    const result = {
      close: () => undefined,
      landmarks: [
        landmarksWith(33, {
          11: { x: 0.36, y: 0.42, z: -0.02 },
          12: { x: 0.64, y: 0.42, z: -0.02 },
          15: { x: 0.22, y: 0.72, z: -0.03 },
          16: { x: 0.78, y: 0.28, z: -0.04 },
        }),
      ],
      segmentationMasks: undefined,
      worldLandmarks: [],
    } satisfies PoseLandmarkerResult;

    const frame = createFrameFromPoseLandmarkerResult(result);

    expect(frame?.source).toBe("body");
    expect(frame?.pitchHand).toMatchObject({
      label: "right wrist",
      role: "pitch",
      x: 0.78,
      y: 0.28,
    });
    expect(frame?.volumeHand).toMatchObject({
      label: "left wrist",
      role: "volume",
      x: 0.22,
      y: 0.72,
    });
  });

  it("suppresses MediaPipe's XNNPACK delegate console banner only", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const infoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    try {
      const result = runWithMediaPipeConsoleNoiseSuppressed(() => {
        console.error("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.");
        console.info("Created TensorFlow Lite XNNPACK delegate for CPU.");
        console.warn("Created TensorFlow Lite XNNPACK delegate for CPU.");
        console.warn("real warning");

        return "tracked";
      });

      expect(result).toBe("tracked");
      expect(errorSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith("real warning");
    } finally {
      errorSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

function category(categoryName: string, score: number): Category {
  return {
    categoryName,
    displayName: categoryName,
    index: 0,
    score,
  };
}

function landmarksWith(
  length: number,
  overrides: Record<number, { x: number; y: number; z: number }>,
) {
  return Array.from({ length }, (_, index) => ({
    visibility: 1,
    x: overrides[index]?.x ?? 0.1,
    y: overrides[index]?.y ?? 0.1,
    z: overrides[index]?.z ?? 0,
  }));
}
