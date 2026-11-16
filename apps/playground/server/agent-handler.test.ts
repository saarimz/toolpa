import { describe, expect, it } from 'vitest';
import { AgentError, WORKERS_AI_MODEL, explainModelHttp, mockInstrument } from '@toolpa/agent';
import { streamAgent } from './agent-handler.ts';

const cloudflare = {
  TOOLPA_MODEL_PROVIDER: 'cloudflare-gateway',
  TOOLPA_ALLOW_NETWORK: '1',
  TOOLPA_MODEL: 'workers-ai/@cf/openai/gpt-oss-120b',
  CF_ACCOUNT_ID: 'acct1',
  CF_GATEWAY_ID: 'gw1',
  CF_AIG_TOKEN: 'cf-token',
};

describe('agent proxy', () => {
  it('uses the mock model when no gateway is configured', async () => {
    let called = 0;
    const stages: { stage: string; notice?: string; provider?: string }[] = [];
    await streamAgent({ prompt: 'warm saw' }, {}, (stage) => {
      stages.push(stage);
    }, { post: async () => { called += 1; return ''; } });
    expect(called).toBe(0);
    const done = stages.find((stage) => stage.stage === 'done');
    expect(done?.provider).toBe('mock');
    expect(done?.notice).toMatch(/mock model/);
  });

  it('calls Workers AI with the same token on both headers', async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const stages: { stage: string; detail?: string; provider?: string }[] = [];
    await streamAgent({ prompt: 'bass' }, cloudflare, (stage) => stages.push(stage), {
      async post(url, headers, body) {
        calls.push({ url, headers, body });
        return JSON.stringify({ choices: [{ message: { reasoning: 'hidden', content: JSON.stringify(mockInstrument('bass')) } }] });
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://gateway.ai.cloudflare.com/v1/acct1/gw1/compat/chat/completions');
    expect(calls[0]?.headers.authorization).toBe('Bearer cf-token');
    expect(calls[0]?.headers['cf-aig-authorization']).toBe('Bearer cf-token');
    expect(JSON.parse(calls[0]?.body ?? '{}').model).toBe(WORKERS_AI_MODEL);
    expect(calls[0]?.body.includes('cf-token')).toBe(false);
    expect(calls[0]?.url.includes('cf-token')).toBe(false);
    expect(stages.some((stage) => stage.stage === 'done' && stage.provider === 'remote')).toBe(true);
  });

  it('surfaces 403 and 410 model errors', async () => {
    for (const status of [403, 410]) {
      const stages: { stage: string; detail?: string }[] = [];
      await streamAgent({ prompt: 'bass' }, cloudflare, (stage) => stages.push(stage), {
        post: () => Promise.reject(new AgentError('MODEL_HTTP', explainModelHttp(status))),
      });
      const error = stages.find((stage) => stage.stage === 'error');
      expect(error?.detail).toContain(String(status));
      expect(error?.detail).toContain('workers-ai/@cf/openai/gpt-oss-120b');
    }
  });
});