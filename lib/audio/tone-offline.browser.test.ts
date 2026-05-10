import { describe, expect, it } from "vitest";
import * as Tone from "tone";

describe("Tone browser audio runtime", () => {
  it("renders a deterministic offline buffer in Chromium", async () => {
    const buffer = await Tone.Offline(() => {
      new Tone.Oscillator(220, "sine").toDestination().start(0).stop(0.05);
    }, 0.1);

    expect(buffer.duration).toBeGreaterThanOrEqual(0.09);
    expect(buffer.numberOfChannels).toBeGreaterThan(0);
  });
});
