import { describe, expect, it, vi } from "vitest";

vi.mock("essentia.js", () => {
  class FakeVector {
    private values: Float32Array;
    public deleted = false;
    constructor(values: Float32Array) {
      this.values = values;
    }
    size() {
      return this.values.length;
    }
    get(index: number) {
      return this.values[index];
    }
    delete() {
      this.deleted = true;
    }
  }

  class FakeEssentia {
    version = "fake-1.0";
    algorithmNames = "Foo,Bar,Baz";
    arrayToVector(array: Float32Array) {
      return new FakeVector(array);
    }
    vectorToArray(vector: FakeVector) {
      const out = new Float32Array(vector.size());
      for (let i = 0; i < out.length; i++) out[i] = vector.get(i);
      return out;
    }
    shutdown() {}
  }

  return {
    default: {
      Essentia: FakeEssentia,
      EssentiaWASM: {},
    },
  };
});

import {
  getEssentia,
  safeDelete,
  shutdownEssentia,
  vectorToArray,
  withChannelVectors,
  withMonoVector,
} from "@/lib/samples/analysis/essentia/runner";

describe("essentia runner", () => {
  it("returns the same instance across calls", () => {
    const a = getEssentia();
    const b = getEssentia();
    expect(a).toBe(b);
  });

  it("shutdownEssentia clears the cached instance", () => {
    const before = getEssentia();
    shutdownEssentia();
    const after = getEssentia();
    expect(before).not.toBe(after);
  });

  it("vectorToArray copies the underlying values", () => {
    const essentia = getEssentia();
    const input = new Float32Array([1, 2, 3]);
    const vector = essentia.arrayToVector(input);
    const result = vectorToArray(vector);
    expect(Array.from(result)).toEqual([1, 2, 3]);
    safeDelete(vector);
  });

  it("withMonoVector deletes the vector even if the callback throws", () => {
    const channels = [new Float32Array([0.1, 0.2, 0.3])];
    let captured: { deleted: boolean } | null = null;
    expect(() =>
      withMonoVector(channels, (_mono, vector) => {
        captured = vector as unknown as { deleted: boolean };
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(captured).toMatchObject({ deleted: true });
  });

  it("withChannelVectors deletes both channels for stereo", () => {
    const left = new Float32Array([0.1]);
    const right = new Float32Array([0.2]);
    let leftVec: { deleted: boolean } | null = null;
    let rightVec: { deleted: boolean } | null = null;
    withChannelVectors([left, right], (l, r) => {
      leftVec = l as unknown as { deleted: boolean };
      rightVec = r as unknown as { deleted: boolean };
    });
    expect(leftVec).toMatchObject({ deleted: true });
    expect(rightVec).toMatchObject({ deleted: true });
  });

  it("safeDelete is a no-op for null/undefined", () => {
    expect(() => safeDelete(null)).not.toThrow();
    expect(() => safeDelete(undefined)).not.toThrow();
  });
});
