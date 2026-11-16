import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { RemoteModel, runAgent } from './agent.ts';
import { createHostedModel, hostedAgentSelfCheck, hostedFromEnv, textFromProvider } from './providers.ts';

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
});