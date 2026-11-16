import { el } from '@elemaudio/core';
import { sha256Hex } from '@toolpa/graph';
import { parseIr, type IrGraph, type IrNode } from '@toolpa/ir';
import type { Trace } from '@toolpa/trace';
import { renderNode } from './offline.ts';

type Elem = ReturnType<typeof el.cycle>;

export interface CookbookPatch {
  name: string;
  graph: unknown;
}

function patch(id: string, nodes: IrNode[], out: string): unknown {
  return {
    schemaVersion: 1,
    id,
    nodes,
    refs: [],
    voices: [],
    ports: { in: [], out: [] },
    out: [{ node: out }],
  };
}

function tone(name: string, kind: string, hz: number, gain = 0.8): CookbookPatch {
  return {
    name,
    graph: patch(
      name,
      [
        { id: 'freq', kind: 'const', props: { value: hz }, inputs: [] },
        { id: 'osc', kind, props: {}, inputs: [{ node: 'freq' }] },
        { id: 'gain', kind: 'const', props: { value: gain }, inputs: [] },
        { id: 'out', kind: 'mul', props: {}, inputs: [{ node: 'osc' }, { node: 'gain' }] },
      ],
      'out',
    ),
  };
}

function noisePatch(name: string, seed: number): CookbookPatch {
  return {
    name,
    graph: patch(
      name,
      [
        { id: 'src', kind: 'noise', props: { seed }, inputs: [] },
        { id: 'gain', kind: 'const', props: { value: 0.4 }, inputs: [] },
        { id: 'out', kind: 'mul', props: {}, inputs: [{ node: 'src' }, { node: 'gain' }] },
      ],
      'out',
    ),
  };
}

function lowpassPatch(name: string, hz: number, cutoff: number): CookbookPatch {
  return {
    name,
    graph: patch(
      name,
      [
        { id: 'freq', kind: 'const', props: { value: hz }, inputs: [] },
        { id: 'cut', kind: 'const', props: { value: cutoff }, inputs: [] },
        { id: 'q', kind: 'const', props: { value: 0.707 }, inputs: [] },
        { id: 'osc', kind: 'cycle', props: {}, inputs: [{ node: 'freq' }] },
        { id: 'filt', kind: 'lowpass', props: {}, inputs: [{ node: 'cut' }, { node: 'q' }, { node: 'osc' }] },
      ],
      'filt',
    ),
  };
}

function intervalPatch(name: string, leftHz: number, rightHz: number): CookbookPatch {
  return {
    name,
    graph: patch(
      name,
      [
        { id: 'left-hz', kind: 'const', props: { value: leftHz }, inputs: [] },
        { id: 'right-hz', kind: 'const', props: { value: rightHz }, inputs: [] },
        { id: 'left', kind: 'cycle', props: {}, inputs: [{ node: 'left-hz' }] },
        { id: 'right', kind: 'cycle', props: {}, inputs: [{ node: 'right-hz' }] },
        { id: 'gain', kind: 'const', props: { value: 0.4 }, inputs: [] },
        { id: 'sum', kind: 'add', props: {}, inputs: [{ node: 'left' }, { node: 'right' }] },
        { id: 'out', kind: 'mul', props: {}, inputs: [{ node: 'sum' }, { node: 'gain' }] },
      ],
      'out',
    ),
  };
}

const PITCHES = [110, 146.83, 196, 220, 261.63, 329.63, 392, 440];
const DEGREES = ['a2', 'd3', 'g3', 'a3', 'c4', 'e4', 'g4', 'a4'];

export const COOKBOOK: CookbookPatch[] = [
  ...DEGREES.map((degree, index) => tone(`sine-${degree}`, 'cycle', PITCHES[index] ?? 440)),
  ...DEGREES.map((degree, index) => tone(`saw-${degree}`, 'blepsaw', PITCHES[index] ?? 440)),
  ...DEGREES.map((degree, index) => tone(`square-${degree}`, 'blepsquare', PITCHES[index] ?? 440, 0.35 + index * 0.05)),
  ...DEGREES.slice(0, 4).map((degree, index) => tone(`tri-${degree}`, 'bleptriangle', PITCHES[index] ?? 440)),
  ...[1, 2, 3, 4].map((seed) => noisePatch(`noise-${seed}`, seed)),
  ...[800, 1600, 3200, 6000].map((cutoff, index) => lowpassPatch(`lowpass-${index + 1}`, 220, cutoff)),
  intervalPatch('interval-fifth', 220, 330),
  intervalPatch('interval-fourth', 220, 293.66),
  intervalPatch('interval-octave', 220, 440),
  intervalPatch('interval-third', 220, 277.18),
];

function must(node: Elem | undefined, id: string): Elem {
  if (!node) throw new Error(`COOKBOOK_NODE: ${id}`);
  return node;
}

function lowerKind(node: IrNode, inputs: Elem[]): Elem {
  const left = inputs[0];
  const middle = inputs[1];
  const right = inputs[2];
  switch (node.kind) {
    case 'const':
      return el.const({ value: Number(node.props.value ?? 0) });
    case 'cycle':
      return el.cycle(must(left, node.id));
    case 'phasor':
      return el.phasor(must(left, node.id));
    case 'blepsaw':
      return el.blepsaw(must(left, node.id));
    case 'blepsquare':
      return el.blepsquare(must(left, node.id));
    case 'bleptriangle':
      return el.bleptriangle(must(left, node.id));
    case 'noise':
      return el.noise({ seed: Number(node.props.seed ?? 1), key: node.id });
    case 'mul':
      return el.mul(must(left, node.id), must(middle, node.id));
    case 'add':
      return el.add(must(left, node.id), must(middle, node.id));
    case 'svf':
      return el.svf({ key: node.id, mode: typeof node.props.mode === 'string' ? node.props.mode : 'lowpass' }, must(left, node.id), must(middle, node.id), must(right, node.id));
    case 'lowpass':
      return el.lowpass(must(left, node.id), must(middle, node.id), must(right, node.id));
    default:
      throw new Error(`COOKBOOK_KIND: ${node.kind}`);
  }
}

export function lowerGraph(graph: IrGraph): Elem {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const built = new Map<string, Elem>();
  const build = (id: string): Elem => {
    const cached = built.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node) throw new Error(`COOKBOOK_NODE: ${id}`);
    const inputs = node.inputs.map((input) => {
      if (typeof input === 'number') return el.const({ value: input });
      if ('ref' in input) throw new Error(`COOKBOOK_REF: ${input.ref}`);
      return build(input.node);
    });
    const made = lowerKind(node, inputs);
    built.set(id, made);
    return made;
  };
  const out = graph.out[0]?.node;
  if (!out) throw new Error('COOKBOOK_OUT');
  return build(out);
}

export async function renderCookbook(trace?: Trace): Promise<{ count: number; digest: string; minPeak: number; hashes: string[] }> {
  if (COOKBOOK.length !== 40) throw new Error('COOKBOOK_COUNT');
  const hashes: string[] = [];
  let minPeak = Number.POSITIVE_INFINITY;
  for (const entry of COOKBOOK) {
    const parsed = await parseIr(entry.graph);
    const pcm = await renderNode(lowerGraph(parsed.graph), { sampleRate: 44100, frames: 128, trace });
    let peak = 0;
    for (const sample of pcm) peak = Math.max(peak, Math.abs(sample));
    minPeak = Math.min(minPeak, peak);
    const bytes = new Uint8Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
    hashes.push(await sha256Hex(bytes));
  }
  const digest = await sha256Hex(hashes.join(''));
  trace?.event('cookbook.render', { count: COOKBOOK.length, minPeak });
  return { count: COOKBOOK.length, digest, minPeak, hashes };
}

export async function cookbookSelfCheck(): Promise<{ count: number; digest: string; minPeak: number }> {
  const rendered = await renderCookbook();
  return { count: rendered.count, digest: rendered.digest, minPeak: rendered.minPeak };
}
