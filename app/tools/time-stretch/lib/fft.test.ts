import { describe, expect, it } from "vitest";

import { fft, getNearestPowerOfTwo } from "@/app/tools/time-stretch/lib/fft";

describe("time stretch fft", () => {
  it("round-trips real-valued buffers through inverse fft", () => {
    const real = Float32Array.from([0, 1, 0.5, -0.25, 0, 0.25, -0.5, -1]);
    const original = Float32Array.from(real);
    const imag = new Float32Array(real.length);

    fft(real, imag);
    fft(real, imag, true);

    for (let index = 0; index < real.length; index += 1) {
      expect(real[index]).toBeCloseTo(original[index] ?? 0, 5);
      expect(imag[index]).toBeCloseTo(0, 5);
    }
  });

  it("rounds window requests to usable powers of two", () => {
    expect(getNearestPowerOfTwo(33)).toBe(32);
    expect(getNearestPowerOfTwo(900)).toBe(1024);
  });
});
