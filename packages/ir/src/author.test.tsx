/** @jsx ir */
import { describe, expect, it } from 'vitest';
import { ir, parseDsl, graphFromJsx, authorSelfCheck } from './author.ts';
import { parseIr } from './ir.ts';

const tone = (
  <graph id="tone">
    <cycle id="osc">
      <const id="rate" value={440} />
    </cycle>
  </graph>
);

describe('authoring parity', () => {
  it('makes JSX, DSL, and JSON the same document', async () => {
    const fromJsx = await parseIr(graphFromJsx(tone));
    const fromDsl = await parseIr(parseDsl('graph tone\nconst rate value=440\ncycle osc rate\nout osc\n'));
    const fromJson = await parseIr({
      schemaVersion: 1,
      id: 'tone',
      nodes: [
        { id: 'rate', kind: 'const', props: { value: 440 }, inputs: [] },
        { id: 'osc', kind: 'cycle', props: {}, inputs: [{ node: 'rate' }] },
      ],
      refs: [],
      voices: [],
      ports: { in: [], out: [] },
      out: [{ node: 'osc' }],
    });
    expect(fromJsx.documentId).toBe(fromDsl.documentId);
    expect(fromJson.documentId).toBe(fromJsx.documentId);
    expect(fromJsx.graph.hash).toBe(fromDsl.graph.hash);
    const check = await authorSelfCheck();
    expect(check.same).toBe(true);
    expect(check.nodes).toBe(2);
    expect(check.documentId).toMatch(/^[a-f0-9]{64}$/);
  });
});