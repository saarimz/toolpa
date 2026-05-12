import { describe, expect, it } from "vitest";

import { createFrameFromResult } from "@/app/tools/camera-theremin/lib/camera";

describe("camera hand-tracking adapter", () => {
  it("normalizes MediaPipe hand landmarker results into theremin frames", () => {
    const result = {
      handedness: [[{ categoryName: "Left", displayName: "Left", index: 0, score: 0.84 }]],
      handednesses: [[{ categoryName: "Left", displayName: "Left", index: 0, score: 0.84 }]],
      landmarks: [
        Array.from({ length: 21 }, (_, index) => ({
          visibility: 1,
          x: index === 8 ? 0.72 : index === 4 ? 0.52 : 0.1,
          y: index === 8 ? 0.24 : index === 4 ? 0.42 : 0.1,
          z: index === 8 ? -0.06 : 0,
        })),
      ],
      worldLandmarks: [],
    };

    const frame = createFrameFromResult(result);

    expect(frame).toMatchObject({
      handedness: "Left",
      score: 0.84,
      x: 0.72,
      y: 0.24,
    });
    expect(frame?.landmarks).toHaveLength(21);
    expect(frame?.pinch).toBeGreaterThan(0.25);
  });
});
