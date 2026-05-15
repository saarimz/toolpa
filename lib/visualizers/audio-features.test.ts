import { describe, expect, it } from "vitest";

import {
  computeAudioFeatureFrame,
  selectAudioFeature,
} from "@/lib/visualizers/audio-features";

describe("audio visualizer feature extraction", () => {
  it("extracts waveform loudness and spectral bands from analyzer data", () => {
    const frequencyData = new Uint8Array(512);
    frequencyData.fill(4);
    frequencyData.fill(230, 2, 8);
    const timeDomainData = new Uint8Array(1024);
    timeDomainData.fill(128);
    for (let index = 0; index < timeDomainData.length; index += 2) {
      timeDomainData[index] = 180;
    }

    const { frame } = computeAudioFeatureFrame({
      frequencyData,
      sampleRate: 44_100,
      timeDomainData,
      timestampMs: 100,
    });

    expect(frame.rms).toBeGreaterThan(0.1);
    expect(frame.bass).toBeGreaterThan(frame.air);
    expect(frame.centroid).toBeGreaterThanOrEqual(0);
    expect(frame.centroid).toBeLessThanOrEqual(1);
    expect(selectAudioFeature(frame, "bass")).toBe(frame.bass);
  });

  it("uses positive spectral flux and beat hold for transient-like changes", () => {
    const previous = new Uint8Array(256);
    previous.fill(10);
    const current = new Uint8Array(256);
    current.fill(180);
    const timeDomainData = new Uint8Array(512);
    timeDomainData.fill(128);
    for (let index = 0; index < timeDomainData.length; index += 4) {
      timeDomainData[index] = 220;
    }

    const first = computeAudioFeatureFrame({
      frequencyData: previous,
      sampleRate: 44_100,
      timeDomainData,
      timestampMs: 0,
    });
    const second = computeAudioFeatureFrame({
      frequencyData: current,
      memory: first.memory,
      sampleRate: 44_100,
      timeDomainData,
      timestampMs: 180,
    });

    expect(second.frame.flux).toBeGreaterThan(0.1);
    expect(second.frame.onset).toBeGreaterThan(0);
    expect(second.frame.beat).toBeGreaterThan(0);
  });
});
