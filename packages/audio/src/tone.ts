import { el } from '@elemaudio/core';
import type { ToneEffect } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';

export function applyTone(source: unknown, effect: ToneEffect, trace?: Trace) {
  trace?.event('effect.tone', { cutoffHz: effect.cutoffHz, q: effect.q, gain: effect.gain });
  return el.mul(effect.gain, el.lowpass(effect.cutoffHz, effect.q, source as never));
}

function walk(value: unknown, kind: string): number {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countNodes(item, kind), 0);
  const record = value as Record<string, unknown>;
  if ('hd' in record || 'tl' in record) return countNodes(record.hd, kind) + walk(record.tl, kind);
  if (typeof record.kind === 'string') return countNodes(record, kind);
  return 0;
}

export function countNodes(node: unknown, kind: string): number {
  if (!node || typeof node !== 'object') return 0;
  const record = node as Record<string, unknown>;
  return (record.kind === kind ? 1 : 0) + walk(record.children, kind);
}
