const FNV_OFFSET = -2128831035;
const FNV_PRIME = 16777619;

export function mix(seed: number, value: number): number {
  return Math.imul(seed ^ value, FNV_PRIME);
}

/** Elementary's hashString, including the extra mix of charCodeAt(length) which is 0. */
export function hashString(seed: number, text: string): number {
  let hash = seed;
  for (let index = 0; index <= text.length; index += 1) hash = mix(hash, text.charCodeAt(index) | 0);
  return hash;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = sortKeys(source[key]);
    return sorted;
  }
  return value;
}

export interface HashedChild {
  hash: number;
  channel: number;
}

/**
 * Elementary's per-node FNV-1a. A string `props.key` excludes the other props.
 * Children are pre-mixed with their output channel, then folded again.
 */
export function hashNode(kind: string, props: Record<string, unknown>, children: readonly HashedChild[]): number {
  const seeded = hashString(FNV_OFFSET, kind);
  const key = props.key;
  const folded = typeof key === 'string' ? hashString(seeded, key) : hashString(seeded, stableStringify(props));
  const reduced = children.reduce((acc, child) => mix(acc, mix(child.hash, child.channel | 0)), folded);
  return reduced & 0x7fffffff;
}
