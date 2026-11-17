import { describe, expect, it } from 'vitest';
import { installNetworkGuard, uninstallNetworkGuard } from '@toolpa/trace';
import { streamInstrument } from './prompt-client.ts';

describe('prompt client', () => {
  it('times out instead of hanging on a silent response', async () => {
    uninstallNetworkGuard();
    const original = globalThis.fetch;
    try {
      globalThis.fetch = () => new Promise(() => undefined) as Promise<Response>;
      await expect(streamInstrument('warm saw', () => undefined, { timeoutMs: 40 })).rejects.toThrow(/timed out after/);
    } finally {
      globalThis.fetch = original;
      installNetworkGuard();
    }
  });

  it('delivers a wait line before the done stage', async () => {
    uninstallNetworkGuard();
    const original = globalThis.fetch;
    const body = `${JSON.stringify({ stage: 'wait', attempt: 1, detail: 'waiting for model (2s)' })}\n${JSON.stringify({ stage: 'done', provider: 'remote', label: 'cloudflare-gateway', notice: 'Cloudflare AI Gateway', hash: 'ab', rack: 'cd', document: {}, dsl: '', chain: {} })}\n`;
    try {
      globalThis.fetch = async () => new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
      const seen: string[] = [];
      const last = await streamInstrument('warm saw', (stage) => {
        if (stage.stage === 'wait') seen.push(stage.detail);
        else seen.push(stage.stage);
      });
      expect(seen).toEqual(['waiting for model (2s)', 'done']);
      expect(last.stage).toBe('done');
    } finally {
      globalThis.fetch = original;
      installNetworkGuard();
    }
  });
});