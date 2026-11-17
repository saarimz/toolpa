import { el } from '@elemaudio/core';
import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { hashNode } from './hash.ts';
import { diffGraphs, parseIr, validateIr } from './ir.ts';

const mono = {
  schemaVersion: 1,
  id: 'sine',
  nodes: [
    { id: 'rate', kind: 'const', props: { value: 440 }, inputs: [] },
    { id: 'osc', kind: 'cycle', props: {}, inputs: [{ node: 'rate' }] },
  ],
  refs: [],
  voices: [],
  ports: { in: [], out: [] },
  out: [{ node: 'osc' }],
  meta: { name: 'ignored' },
};

describe('IR identity', () => {
  it('matches elementary FNV for const, mul, and a keyed const', () => {
    const value = el.const({ value: 1 });
    expect(hashNode('const', { value: 1 }, [])).toBe(value.hash);
    const left = el.const({ value: 2 });
    const right = el.const({ value: 3 });
    const product = el.mul(left, right);
    expect(
      hashNode('mul', {}, [
        { hash: left.hash, channel: 0 },
        { hash: right.hash, channel: 0 },
      ]),
    ).toBe(product.hash);
    expect(el.const({ key: 'cutoff', value: 200 }).hash).toBe(el.const({ key: 'cutoff', value: 800 }).hash);
    expect(hashNode('const', { key: 'cutoff', value: 200 }, [])).toBe(el.const({ key: 'cutoff', value: 200 }).hash);
  });

  it('stamps an FNV graph hash and a SHA-256 document id, ignoring meta', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const first = await parseIr(mono, trace);
    const renamed = await parseIr({ ...mono, meta: { name: 'other' } });
    expect(first.graph.hash).toBe(renamed.graph.hash);
    expect(first.documentId).toBe(renamed.documentId);
    expect(first.documentId).toMatch(/^[a-f0-9]{64}$/);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('ir.hash');
    expect(names).toContain('ir.validate');
  });

  it('keeps a keyed cutoff mounted when only its value changes', async () => {
    const before = await parseIr({
      ...mono,
      nodes: [
        { id: 'rate', kind: 'const', props: { key: 'cutoff', value: 200 }, inputs: [] },
        mono.nodes[1],
      ],
    });
    const after = await parseIr({
      ...mono,
      nodes: [
        { id: 'rate', kind: 'const', props: { key: 'cutoff', value: 800 }, inputs: [] },
        mono.nodes[1],
      ],
    });
    const diff = diffGraphs(before.graph, after.graph);
    expect(diff.kept).toBe(2);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it('rejects a cycle and inlines a subpatch', async () => {
    expect(validateIr({
      schemaVersion: 1,
      id: 'loop',
      nodes: [
        { id: 'a', kind: 'cycle', props: {}, inputs: [{ node: 'b' }] },
        { id: 'b', kind: 'cycle', props: {}, inputs: [{ node: 'a' }] },
      ],
      refs: [],
      voices: [],
      ports: { in: [], out: [] },
      out: [{ node: 'a' }],
    }).some((issue) => issue.code === 'V10')).toBe(true);
    const inlined = await parseIr({
      schemaVersion: 1,
      id: 'wrap',
      nodes: [
        {
          id: 'voice',
          kind: 'subpatch',
          props: {
            prefix: 'v',
            def: mono,
          },
          inputs: [],
        },
      ],
      refs: [],
      voices: [],
      ports: { in: [], out: [] },
      out: [{ node: 'voice' }],
    });
    expect(inlined.graph.nodes.map((node) => node.id)).toEqual(['v__rate', 'v__osc']);
    expect(inlined.graph.out[0]?.node).toBe('v__osc');
  });
});
