import { el } from '@elemaudio/core';
import type { ToneEffect } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';

export function applyTone(source: unknown, effect: ToneEffect, trace?: Trace) {
  trace?.event('effect.tone', { cutoffHz: effect.cutoffHz, q: effect.q, gain: effect.gain });
  return el.mul(effect.gain, el.lowpass(effect.cutoffHz, effect.q, source as never));
}
