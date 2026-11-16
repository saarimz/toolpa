import type { Trace } from '@toolpa/trace';
import { IrError, parseIr, type IrNode } from './ir.ts';

export interface JsxDraft {
  tag: string;
  props: Record<string, unknown>;
  children: Array<JsxDraft | number | string>;
}

export function ir(tag: string, props: Record<string, unknown> | null, ...children: Array<JsxDraft | number | string>): JsxDraft {
  return { tag, props: props ?? {}, children };
}

function document(id: string, nodes: IrNode[], out: string): unknown {
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

export function graphFromJsx(draft: JsxDraft): unknown {
  if (draft.tag !== 'graph') throw new IrError('AUTHOR_ROOT', 'AUTHOR_ROOT: JSX starts at graph');
  if (typeof draft.props.id !== 'string') throw new IrError('AUTHOR_ID', 'AUTHOR_ID: the graph needs an id');
  const nodes: IrNode[] = [];
  const walk = (node: JsxDraft): string => {
    if (typeof node.props.id !== 'string') throw new IrError('AUTHOR_ID', 'AUTHOR_ID: a node needs an id');
    const inputs = node.children.map((child) => {
      if (typeof child === 'number') return child;
      if (typeof child === 'string') return { node: child };
      return { node: walk(child) };
    });
    const props = { ...node.props };
    delete props.id;
    nodes.push({ id: node.props.id, kind: node.tag, props, inputs });
    return node.props.id;
  };
  const roots = draft.children.filter((child): child is JsxDraft => typeof child !== 'number' && typeof child !== 'string');
  if (roots.length !== 1) throw new IrError('AUTHOR_ROOT', 'AUTHOR_ROOT: a graph has one output node');
  return document(draft.props.id, nodes, walk(roots[0] as JsxDraft));
}

export function parseDsl(source: string): unknown {
  let id = '';
  let out = '';
  const nodes: IrNode[] = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const head = parts[0] ?? '';
    if (head === 'graph') {
      id = parts[1] ?? '';
      continue;
    }
    if (head === 'out') {
      out = parts[1] ?? '';
      continue;
    }
    const props: Record<string, unknown> = {};
    const inputs: IrNode['inputs'] = [];
    for (const token of parts.slice(2)) {
      if (token.includes('=')) {
        const [key, value = ''] = token.split('=');
        if (!key) throw new IrError('AUTHOR_PROP', 'AUTHOR_PROP: a property needs a name');
        props[key] = /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
      } else if (/^-?\d+(?:\.\d+)?$/.test(token)) inputs.push(Number(token));
      else inputs.push({ node: token });
    }
    nodes.push({ id: parts[1] ?? '', kind: head, props, inputs });
  }
  if (!id || !out) throw new IrError('AUTHOR_ROOT', 'AUTHOR_ROOT: DSL needs a graph id and an out');
  return document(id, nodes, out);
}

const TONE_DSL = `graph tone
const rate value=440
cycle osc rate
out osc
`;

export async function authorSelfCheck(trace?: Trace): Promise<{ same: boolean; nodes: number; documentId: string }> {
  const fromJsx = graphFromJsx(ir('graph', { id: 'tone' }, ir('cycle', { id: 'osc' }, ir('const', { id: 'rate', value: 440 }))));
  const fromDsl = parseDsl(TONE_DSL);
  const fromJson = JSON.parse(JSON.stringify(fromDsl)) as unknown;
  const jsx = await parseIr(fromJsx, trace);
  const dsl = await parseIr(fromDsl, trace);
  const json = await parseIr(fromJson, trace);
  const again = await parseIr(JSON.parse(JSON.stringify(jsx.graph)));
  const same = jsx.documentId === dsl.documentId && dsl.documentId === json.documentId && json.documentId === again.documentId && jsx.graph.hash === dsl.graph.hash;
  trace?.event('ir.author', { format: 'jsx', nodes: jsx.graph.nodes.length, same });
  return { same, nodes: jsx.graph.nodes.length, documentId: jsx.documentId };
}
