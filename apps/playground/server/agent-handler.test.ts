import { describe, expect, it } from 'vitest';
import { AgentError, WORKERS_AI_MODEL, explainModelHttp, mockInstrument } from '@toolpa/agent';
import { agentStatus, streamAgent, writeStage, AGENT_STREAM_HEADERS } from './agent-handler.ts';

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

  it('reports the configured provider and names it on the first plan stage', async () => {
    const status = agentStatus(cloudflare);
    expect(status).toMatchObject({
      provider: 'cloudflare-gateway',
      label: 'cloudflare-gateway',
      model: WORKERS_AI_MODEL,
      configured: true,
    });
    expect(status.notice).toContain('Cloudflare AI Gateway');
    expect(JSON.stringify(status)).not.toContain('cf-token');
    expect(agentStatus({}).configured).toBe(false);
    expect(agentStatus({}).provider).toBe('mock');

    const logs: { event: string; stage?: string; status?: number }[] = [];
    const stages: { stage: string; detail?: string; label?: string; notice?: string }[] = [];
    await streamAgent({ prompt: 'bass' }, cloudflare, (stage) => stages.push(stage), {
      async post() {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return JSON.stringify({ choices: [{ message: { content: JSON.stringify(mockInstrument('bright')) } }] });
      },
    }, {
      heartbeatMs: 15,
      log: (entry) => logs.push(entry),
    });
    expect(stages[0]?.stage).toBe('plan');
    expect(stages[0]?.label).toBe('cloudflare-gateway');
    expect(stages[0]?.detail).toContain('cloudflare-gateway');
    expect(stages[0]?.notice).toContain(WORKERS_AI_MODEL);
    expect(stages.some((stage) => stage.stage === 'wait' && stage.detail?.startsWith('waiting for model ('))).toBe(true);
    expect(logs.some((entry) => entry.event === 'request')).toBe(true);
    expect(logs.some((entry) => entry.event === 'stage' && entry.stage === 'plan')).toBe(true);
    expect(logs.some((entry) => entry.event === 'upstream' && entry.status === 200)).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('cf-token');
    expect(AGENT_STREAM_HEADERS['cache-control']).toBe('no-cache');
    expect(AGENT_STREAM_HEADERS['x-accel-buffering']).toBe('no');
    expect(AGENT_STREAM_HEADERS['content-type']).toContain('application/x-ndjson');
    let flushed = 0;
    const lines: string[] = [];
    writeStage({
      write: (chunk) => lines.push(chunk),
      flush: () => { flushed += 1; },
    }, { stage: 'wait', attempt: 1, detail: 'waiting for model (2s)' });
    expect(flushed).toBe(1);
    expect(lines[0]).toBe('{"stage":"wait","attempt":1,"detail":"waiting for model (2s)"}\n');
  });

  it('logs a 403 from the upstream model', async () => {
    const logs: { event: string; status?: number }[] = [];
    await streamAgent({ prompt: 'bass' }, cloudflare, () => undefined, {
      post: () => Promise.reject(new AgentError('MODEL_HTTP', explainModelHttp(403))),
    }, { log: (entry) => logs.push(entry) });
    expect(logs.some((entry) => entry.event === 'upstream' && entry.status === 403)).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('cf-token');
  });
});