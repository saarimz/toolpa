export type SeededRandom = () => number;

export function createSeededRandom(seed: number): SeededRandom {
  let state = Math.max(1, Math.floor(seed) % 2147483647);
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function hashSeed(input: string, fallback = 7331) {
  let hash = fallback;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  }
  return Math.max(1, Math.abs(hash) % 2147483646);
}
