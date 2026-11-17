import { describe, expect, it } from 'vitest';
import { TRACE_NAMES } from './names.ts';
import { auditEntry, auditWorkspace } from '../../../scripts/license-audit.ts';

const PLAN_EVENTS = [
  'harness.canary',
  'engine.versions',
  'ir.validate',
  'ir.hash',
  'engine.lower',
  'render.offline',
  'render.twice',
  'render.nan',
  'golden.check',
  'wav.encode',
  'wav.decode',
  'vfs.register',
  'engine.init',
  'ctx.state',
  'ctx.latency',
  'live.playbackStats',
  'live.stall',
  'live.load',
  'live.swap',
  'source.load',
  'source.decode',
  'ui.action',
  'export.wav',
  'artifact.pack',
  'artifact.verify',
  'artifact.unpack',
  'artifact.save',
  'artifact.load',
  'error',
];

describe('slice license and telemetry registry', () => {
  it('keeps every plan event name registered', () => {
    for (const name of PLAN_EVENTS) expect(TRACE_NAMES.has(name), name).toBe(true);
  });

  it('expects GPL-3.0-or-later in this repo and GPL-compatible third-party licenses', () => {
    const root = new URL('../../../', import.meta.url);
    expect(auditWorkspace(root.pathname)).toEqual([]);
    expect(auditEntry({ name: 'evil', license: 'AGPL-3.0-only', firstParty: false })).toMatch(/AGPL/);
    expect(auditEntry({ name: '@toolpa/trace', license: 'MIT', firstParty: true })).toMatch(/GPL-3.0-or-later/);
  });
});