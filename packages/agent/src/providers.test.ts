import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { RemotePromptProvider } from '../../generate/src/generate.ts';
import { RemoteModel, runAgent } from './agent.ts';
import { WORKERS_AI_MODEL, explainModelHttp, GatewayProvider, createHostedModel, gatewaySelfCheck, hostedAgentSelfCheck, hostedFromEnv, providerFromEnv, requestFor, textFromProvider } from './providers.ts';

const reply = (content: string, kind: 'openai' | 'anthropic' | 'ollama') => {
  if (kind === 'openai') return JSON.stringify({ choices: [{ message: { content } }] });
  if (kind === 'anthropic') return JSON.stringify({ content: [{ type: 'text', text: content }] });
  return JSON.stringify({ message: { content } });
};

describe('hosted model providers', () => {
  it('builds the rack from an injected provider and keeps the key out of the body', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const seen: { url: string; body: string; header: string }[] = [];
    for (const kind of ['openai', 'anthropic', 'ollama'] as const) {
      const model = createHostedModel(
        {
          kind,
          apiKey: kind === 'ollama' ? undefined : 'test-key',
          allowNetwork: true,
          baseUrl: kind === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:9',
          transport: {
            async post(url, headers, body) {
              seen.push({ url, body, header: headers.authorization ?? headers['x-api-key'] ?? '' });
              return reply('keys sine lowpass', kind);
            },
          },
        },
        trace,
      );
      const built = await runAgent('make a bass', { maxAttempts: 1, model });
      expect(built.provider).toBe('remote');
      expect(built.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(built)).not.toContain('test-key');
    }
    expect(seen.map((call) => call.url)).toEqual([
      'http://127.0.0.1:9/chat/completions',
      'http://127.0.0.1:9/v1/messages',
      'http://127.0.0.1:11434/api/chat',
    ]);
    expect(seen[0]?.header).toBe('Bearer test-key');
    expect(seen[1]?.header).toBe('test-key');
    expect(seen.every((call) => !call.body.includes('test-key'))).toBe(true);
    expect(textFromProvider('openai', reply('keys sine lowpass', 'openai'))).toBe('keys sine lowpass');
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('model.call');
    expect(() => new RemoteModel().complete('sine')).toThrow(/NOT_CONFIGURED/);
    await expect(hostedFromEnv('openai').complete('sine')).rejects.toThrow(/NOT_CONFIGURED/);
    let called = false;
    await expect(
      createHostedModel({
        kind: 'openai',
        apiKey: 'test-key',
        allowNetwork: false,
        transport: {
          async post() {
            called = true;
            return reply('keys', 'openai');
          },
        },
      }).complete('sine'),
    ).rejects.toThrow(/NOT_CONFIGURED/);
    expect(called).toBe(false);
    const check = await hostedAgentSelfCheck();
    expect(check.provider).toBe('remote');
    expect(check.called).toBe(true);
    expect(check.blocked).toBe('NOT_CONFIGURED');
    expect(check.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sends Vercel and Cloudflare gateway requests through a fetch stub', async () => {
    const previous = process.env.TOOLPA_MODEL_PROVIDER;
    delete process.env.TOOLPA_MODEL_PROVIDER;
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: String(input), headers, body: String(init?.body ?? '') });
      const model = (JSON.parse(String(init?.body ?? '{}')) as { model?: string }).model ?? '';
      const content = model.startsWith('anthropic/') ? '60:0:90 64:2:80' : 'keys sine lowpass';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      expect(providerFromEnv().provider).toBe('mock');
      const vercel = new GatewayProvider({
        kind: 'vercel-gateway',
        apiKey: 'gw-key',
        allowNetwork: true,
        model: 'anthropic/claude-haiku',
      });
      const notes = await new RemotePromptProvider((prompt) => vercel.complete(prompt)).generate('bass line');
      expect(notes).toEqual([
        { midi: 60, step: 0, velocity: 90 },
        { midi: 64, step: 2, velocity: 80 },
      ]);
      const cloudflare = new GatewayProvider({
        kind: 'cloudflare-gateway',
        apiKey: 'cf-token',
        accountId: 'acct1',
        gatewayId: 'gw1',
        allowNetwork: true,
        model: 'openai/gpt-4o-mini',
      });
      const built = await runAgent('make a bass', { maxAttempts: 1, model: cloudflare });
      expect(built.provider).toBe('remote');
      expect(built.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(built)).not.toContain('cf-token');
      expect(calls.map((call) => call.url)).toEqual([
        'https://ai-gateway.vercel.sh/v1/chat/completions',
        'https://gateway.ai.cloudflare.com/v1/acct1/gw1/compat/chat/completions',
      ]);
      expect(calls[0]?.headers.authorization).toBe('Bearer gw-key');
      expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({ model: 'anthropic/claude-haiku' });
      expect(calls[0]?.body.includes('gw-key')).toBe(false);
      expect(calls[0]?.url.includes('gw-key')).toBe(false);
      expect(calls[1]?.headers['cf-aig-authorization']).toBe('Bearer cf-token');
      expect(JSON.parse(calls[1]?.body ?? '{}')).toMatchObject({ model: 'openai/gpt-4o-mini' });
      expect(calls[1]?.body.includes('cf-token')).toBe(false);
      expect(calls[1]?.url.includes('cf-token')).toBe(false);
      const sent = calls.length;
      await expect(
        new GatewayProvider({ kind: 'cloudflare-gateway', apiKey: 'cf-token', accountId: 'acct1', gatewayId: 'gw1', allowNetwork: false }).complete('bass'),
      ).rejects.toThrow(/NOT_CONFIGURED/);
      await expect(
        new GatewayProvider({ kind: 'cloudflare-gateway', apiKey: 'cf-token', allowNetwork: true }).complete('bass'),
      ).rejects.toThrow(/NOT_CONFIGURED/);
      expect(calls.length).toBe(sent);
      const direct = createHostedModel({
        kind: 'openai-compatible',
        apiKey: 'sk-test',
        allowNetwork: true,
        baseUrl: 'http://127.0.0.1:9/v1',
        model: 'gpt-4o-mini',
        transport: {
          async post(url, headers, body) {
            expect(url).toBe('http://127.0.0.1:9/v1/chat/completions');
            expect(headers.authorization).toBe('Bearer sk-test');
            expect(body.includes('sk-test')).toBe(false);
            return JSON.stringify({ choices: [{ message: { content: 'keys sine lowpass' } }] });
          },
        },
      });
      expect(await direct.complete('keys sine lowpass')).toEqual(['keys', 'sine', 'lowpass']);
      const check = await gatewaySelfCheck();
      expect(check.vercel).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
      expect(check.cloudflare).toBe('https://gateway.ai.cloudflare.com/v1/acct1/gw1/compat/chat/completions');
      expect(check.model).toBe('anthropic/claude-haiku');
      expect(check.notes).toBe(2);
      const workers = requestFor(
        { kind: 'cloudflare-gateway', apiKey: 'cf-token', accountId: 'acct1', gatewayId: 'gw1' },
        'bass',
      );
      expect(workers.url).toBe('https://gateway.ai.cloudflare.com/v1/acct1/gw1/compat/chat/completions');
      expect(workers.headers.authorization).toBe('Bearer cf-token');
      expect(workers.headers['cf-aig-authorization']).toBe('Bearer cf-token');
      expect(JSON.parse(workers.body).model).toBe(WORKERS_AI_MODEL);
      expect(JSON.parse(workers.body).max_tokens).toBeGreaterThanOrEqual(4096);
      expect(JSON.parse(workers.body).reasoning_effort).toBe('low');
      const shaped = requestFor(
        { kind: 'cloudflare-gateway', apiKey: 'cf-token', accountId: 'acct1', gatewayId: 'gw1', model: WORKERS_AI_MODEL },
        'bass',
        { system: 'Return JSON.', jsonSchema: { type: 'object' } },
      );
      const shapedBody = JSON.parse(shaped.body) as { max_tokens: number; response_format: { type: string }; messages: { role: string }[] };
      expect(shapedBody.max_tokens).toBeGreaterThanOrEqual(4096);
      expect(shapedBody.response_format.type).toBe('json_object');
      expect(shapedBody.messages[0]?.role).toBe('system');
      expect(workers.body.includes('cf-token')).toBe(false);
      expect(textFromProvider('cloudflare-gateway', JSON.stringify({ choices: [{ message: { reasoning: 'think', content: '{"ok":true}' } }] }))).toBe('{"ok":true}');
      expect(() => textFromProvider('cloudflare-gateway', JSON.stringify({ choices: [{ message: { reasoning: 'only thoughts' } }] }))).toThrow(/reasoning without message content/);
      expect(() => textFromProvider('cloudflare-gateway', JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '' } }] }))).toThrow(/TOOLPA_MAX_TOKENS/);
      expect(explainModelHttp(403)).toMatch(/kimi-k2.6/);
      expect(explainModelHttp(410)).toMatch(/llama-3.1-8b-instruct/);
    } finally {
      globalThis.fetch = original;
      if (previous === undefined) delete process.env.TOOLPA_MODEL_PROVIDER;
      else process.env.TOOLPA_MODEL_PROVIDER = previous;
    }
  });
});