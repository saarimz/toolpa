import { sha256Hex } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { hashNode, type HashedChild } from './hash.ts';

const AUTHORED_ID = /^[a-z][a-z0-9-]*$/;
const INTERNAL_ID = /^[a-z][a-z0-9_-]*$/;

export class IrError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IrError';
  }
}

export interface IrNode {
  id: string;
  kind: string;
  props: Record<string, unknown>;
  inputs: InputRef[];
}

export type InputRef = { node: string; out?: number } | { ref: string } | number;

export interface IrGraph {
  schemaVersion: number;
  id: string;
  hash: string;
  nodes: IrNode[];
  refs: Array<{ ref: string; kind: string; value: number; min: number; max: number; smoothMs: number }>;
  voices: unknown[];
  ports: { in: unknown[]; out: unknown[] };
  out: Array<{ node: string; out?: number }>;
  meta?: Record<string, unknown>;
}

interface KindSpec {
  arity: number | { min: number };
}

const KINDS: Record<string, KindSpec> = {
  const: { arity: 0 },
  cycle: { arity: 1 },
  phasor: { arity: 1 },
  blepsaw: { arity: 1 },
  blepsquare: { arity: 1 },
  bleptriangle: { arity: 1 },
  noise: { arity: 0 },
  mul: { arity: { min: 2 } },
  add: { arity: { min: 2 } },
  sub: { arity: 2 },
  delay: { arity: 3 },
  svf: { arity: 3 },
  lowpass: { arity: 3 },
  tapIn: { arity: 0 },
  tapOut: { arity: 1 },
  subpatch: { arity: { min: 0 } },
};

export interface IrIssue {
  code: string;
  message: string;
  path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function arityOk(spec: KindSpec, count: number): boolean {
  if (typeof spec.arity === 'number') return count === spec.arity;
  return count >= spec.arity.min;
}

export function validateIr(input: unknown, internal = false): IrIssue[] {
  const issues: IrIssue[] = [];
  if (!isRecord(input)) return [{ code: 'V0', message: 'IR must be an object', path: '' }];
  if (input.schemaVersion !== 1) issues.push({ code: 'V0', message: 'schemaVersion must be 1', path: 'schemaVersion' });
  if (typeof input.id !== 'string' || !AUTHORED_ID.test(input.id)) issues.push({ code: 'V0', message: 'graph id is invalid', path: 'id' });
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  if (nodes.length < 1 || nodes.length > 1024) issues.push({ code: 'V0', message: 'a graph has 1 to 1024 nodes', path: 'nodes' });
  const idPattern = internal ? INTERNAL_ID : AUTHORED_ID;
  const seen = new Set<string>();
  const byId = new Map<string, IrNode>();
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.id !== 'string' || typeof node.kind !== 'string' || !Array.isArray(node.inputs)) {
      issues.push({ code: 'V0b', message: 'a node needs id, kind, and inputs', path: 'nodes' });
      continue;
    }
    if (!idPattern.test(node.id)) issues.push({ code: 'V1', message: 'node id is invalid', path: node.id });
    if (seen.has(node.id)) issues.push({ code: 'V1', message: 'duplicate node id', path: node.id });
    seen.add(node.id);
    const spec = KINDS[node.kind];
    if (!spec) issues.push({ code: 'V0', message: `unknown kind ${node.kind}`, path: node.id });
    else if (!arityOk(spec, node.inputs.length)) issues.push({ code: 'V0c', message: `${node.kind} arity`, path: node.id });
    if (node.kind === 'delay' && typeof node.inputs[1] === 'number' && Math.abs(node.inputs[1]) >= 1) {
      issues.push({ code: 'V7', message: 'delay feedback must be inside -1..1', path: node.id });
    }
    byId.set(node.id, node as unknown as IrNode);
  }
  const refs = Array.isArray(input.refs) ? input.refs : [];
  const refNames = new Set<string>();
  for (const ref of refs) {
    if (!isRecord(ref) || typeof ref.ref !== 'string') {
      issues.push({ code: 'V2', message: 'a ref needs a name', path: 'refs' });
      continue;
    }
    if (refNames.has(ref.ref)) issues.push({ code: 'V2', message: 'duplicate ref', path: ref.ref });
    refNames.add(ref.ref);
    if (typeof ref.value === 'number' && typeof ref.min === 'number' && typeof ref.max === 'number') {
      if (ref.value < ref.min || ref.value > ref.max) issues.push({ code: 'V14', message: 'ref value is outside min..max', path: ref.ref });
    }
  }
  for (const node of byId.values()) {
    for (const inputRef of node.inputs) {
      if (typeof inputRef === 'number') continue;
      if (isRecord(inputRef) && typeof inputRef.node === 'string') {
        if (!byId.has(inputRef.node)) issues.push({ code: 'V4', message: 'dangling input', path: `${node.id}->${inputRef.node}` });
      } else if (isRecord(inputRef) && typeof inputRef.ref === 'string') {
        if (!refNames.has(inputRef.ref)) issues.push({ code: 'V5', message: 'dangling ref', path: `${node.id}->${inputRef.ref}` });
      } else issues.push({ code: 'V4', message: 'input is not a node, ref, or number', path: node.id });
    }
  }
  const outs = Array.isArray(input.out) ? input.out : [];
  if (outs.length < 1) issues.push({ code: 'V3', message: 'graph needs an output', path: 'out' });
  for (const out of outs) {
    if (!isRecord(out) || typeof out.node !== 'string' || !byId.has(out.node)) {
      issues.push({ code: 'V3', message: 'output node is missing', path: 'out' });
    }
  }
  if (hasIllegalCycle(byId)) issues.push({ code: 'V10', message: 'illegal cycle', path: 'nodes' });
  return issues;
}

function hasIllegalCycle(nodes: Map<string, IrNode>): boolean {
  const state = new Map<string, number>();
  const visit = (id: string): boolean => {
    const mark = state.get(id) ?? 0;
    if (mark === 1) return true;
    if (mark === 2) return false;
    state.set(id, 1);
    const node = nodes.get(id);
    if (node) {
      for (const inputRef of node.inputs) {
        if (isRecord(inputRef) && typeof inputRef.node === 'string' && nodes.has(inputRef.node) && visit(inputRef.node)) return true;
      }
    }
    state.set(id, 2);
    return false;
  };
  for (const id of nodes.keys()) if (visit(id)) return true;
  return false;
}

function nodeHash(node: IrNode, hashes: Map<string, number>, refs: Map<string, number>): number {
  const children: HashedChild[] = node.inputs.map((inputRef) => {
    if (typeof inputRef === 'number') return { hash: hashNode('const', { value: inputRef }, []), channel: 0 };
    if ('node' in inputRef) return { hash: hashes.get(inputRef.node) ?? 0, channel: inputRef.out ?? 0 };
    return { hash: hashNode('const', { key: inputRef.ref, value: refs.get(inputRef.ref) ?? 0 }, []), channel: 0 };
  });
  return hashNode(node.kind, node.props, children);
}

export function hashGraph(graph: IrGraph): number {
  const refs = new Map(graph.refs.map((ref) => [ref.ref, ref.value]));
  const pending = new Map(graph.nodes.map((node) => [node.id, node]));
  const hashes = new Map<string, number>();
  const ordered: number[] = [];
  while (pending.size > 0) {
    const ready = [...pending.values()].filter((node) =>
      node.inputs.every((inputRef) => typeof inputRef === 'number' || 'ref' in inputRef || hashes.has(inputRef.node)),
    );
    if (ready.length === 0) break;
    const hashed = ready.map((node) => ({ node, hash: nodeHash(node, hashes, refs) }));
    hashed.sort((left, right) => left.hash - right.hash || left.node.id.localeCompare(right.node.id));
    for (const item of hashed) {
      hashes.set(item.node.id, item.hash);
      ordered.push(item.hash);
      pending.delete(item.node.id);
    }
  }
  let folded = hashNode('graph', {}, []);
  for (const hash of ordered) folded = (Math.imul(folded ^ hash, 16777619) & 0x7fffffff) >>> 0;
  for (const out of graph.out) {
    const hash = hashes.get(out.node) ?? 0;
    folded = (Math.imul(folded ^ hash, 16777619) & 0x7fffffff) >>> 0;
  }
  return folded & 0x7fffffff;
}

export function nodeHashes(graph: IrGraph): Map<string, number> {
  const refs = new Map(graph.refs.map((ref) => [ref.ref, ref.value]));
  const pending = new Map(graph.nodes.map((node) => [node.id, node]));
  const hashes = new Map<string, number>();
  while (pending.size > 0) {
    const ready = [...pending.values()].filter((node) =>
      node.inputs.every((inputRef) => typeof inputRef === 'number' || 'ref' in inputRef || hashes.has(inputRef.node)),
    );
    if (ready.length === 0) break;
    for (const node of ready) {
      hashes.set(node.id, nodeHash(node, hashes, refs));
      pending.delete(node.id);
    }
  }
  return hashes;
}

function identityBody(graph: Omit<IrGraph, 'hash'> & { hash?: string }): unknown {
  const { hash: _hash, meta: _meta, ...body } = graph;
  return body;
}

export async function parseIr(input: unknown, trace?: Trace): Promise<{ graph: IrGraph; documentId: string; issues: IrIssue[] }> {
  const issues = validateIr(input);
  const hard = issues.filter((issue) => issue.code !== 'V15');
  if (hard.length > 0) {
    trace?.event('ir.validate', { ok: false, issues: hard.length });
    throw new IrError(hard[0]?.code ?? 'V0', `${hard[0]?.code ?? 'V0'}: ${hard[0]?.message ?? 'invalid IR'}`);
  }
  const source = input as IrGraph;
  const inlined = inlineSubpatches(source);
  const hash = hashGraph(inlined).toString(16);
  const supplied = typeof source.hash === 'string' ? source.hash : '';
  if (supplied && supplied !== hash) issues.push({ code: 'V15', message: 'supplied hash was stale', path: 'hash' });
  const graph: IrGraph = { ...inlined, hash, meta: source.meta };
  const documentId = await sha256Hex(JSON.stringify(identityBody(graph)));
  trace?.event('ir.validate', { ok: true, issues: issues.length });
  trace?.event('ir.hash', { fnv: hash, documentId });
  return { graph, documentId, issues };
}

function inlineSubpatches(graph: IrGraph): IrGraph {
  const nodes: IrNode[] = [];
  const redirect = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.kind !== 'subpatch') {
      nodes.push(node);
      continue;
    }
    const def = node.props.def;
    if (!isRecord(def)) throw new IrError('V-S1', 'V-S1: a subpatch needs a def');
    if (JSON.stringify(def).includes('"kind":"subpatch"')) throw new IrError('V-S2', 'V-S2: nested subpatches are rejected');
    const prefix = typeof node.props.prefix === 'string' ? node.props.prefix : node.id;
    const inner = def as unknown as IrGraph;
    const innerIssues = validateIr(inner);
    if (innerIssues.length > 0) throw new IrError(innerIssues[0]?.code ?? 'V-S1', innerIssues[0]?.message ?? 'invalid subpatch');
    for (const innerNode of inner.nodes) {
      nodes.push({
        ...innerNode,
        id: `${prefix}__${innerNode.id}`,
        inputs: innerNode.inputs.map((inputRef) =>
          isRecord(inputRef) && typeof inputRef.node === 'string' ? { ...inputRef, node: `${prefix}__${inputRef.node}` } : inputRef,
        ),
      });
    }
    const outNode = inner.out[0]?.node;
    if (!outNode) throw new IrError('V-S1', 'V-S1: a subpatch def needs an output');
    redirect.set(node.id, `${prefix}__${outNode}`);
  }
  const rewritten = nodes.map((node) => ({
    ...node,
    inputs: node.inputs.map((inputRef) =>
      isRecord(inputRef) && typeof inputRef.node === 'string' && redirect.has(inputRef.node)
        ? { ...inputRef, node: redirect.get(inputRef.node) as string }
        : inputRef,
    ),
  }));
  return {
    ...graph,
    hash: '',
    nodes: rewritten,
    out: graph.out.map((out) => (redirect.has(out.node) ? { ...out, node: redirect.get(out.node) as string } : out)),
  };
}

export interface IrDiff {
  kept: number;
  retarget: number;
  added: number;
  removed: number;
}

export function diffGraphs(before: IrGraph, after: IrGraph, trace?: Trace): IrDiff {
  const left = nodeHashes(before);
  const right = nodeHashes(after);
  const leftValues = new Set(left.values());
  const rightValues = new Set(right.values());
  let kept = 0;
  let retarget = 0;
  for (const [id, hash] of right) {
    if (left.get(id) === hash) kept += 1;
    else if (leftValues.has(hash)) retarget += 1;
    else if ([...left.keys()].includes(id)) retarget += 1;
  }
  const added = [...right.values()].filter((hash) => !leftValues.has(hash)).length;
  const removed = [...left.values()].filter((hash) => !rightValues.has(hash)).length;
  const diff = { kept, retarget, added, removed };
  trace?.event('ir.diff', diff);
  return diff;
}

export function irSelfCheck(): { constHash: number; keyedStable: boolean; cycle: string } {
  const plain = hashNode('const', { value: 1 }, []);
  const low = hashNode('const', { key: 'cutoff', value: 200 }, []);
  const high = hashNode('const', { key: 'cutoff', value: 800 }, []);
  let cycle = 'ok';
  try {
    validateIr({
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
    });
  } catch {
    cycle = 'thrown';
  }
  const issues = validateIr({
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
  });
  return { constHash: plain, keyedStable: low === high && low !== plain, cycle: issues.some((issue) => issue.code === 'V10') ? 'V10' : cycle };
}
