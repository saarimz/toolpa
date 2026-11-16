import type { Trace } from '@toolpa/trace';
import { AgentError, runAgent, type ModelProvider } from './agent.ts';

export type ProviderKind = 'openai' | 'anthropic' | 'ollama';

export interface ChatTransport {
  post(url: string, headers: Record<string, string>, body: string): Promise<string>;
}

export interface ProviderSettings {
  kind: ProviderKind;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  allowNetwork?: boolean;
  transport?: ChatTransport;
}

const DEFAULTS: Record<ProviderKind, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-latest' },
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'llama3.2' },
};

function env(name: string): string | undefined {
  const value = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  return value && value.length > 0 ? value : undefined;
}

export function settingsFromEnv(kind: ProviderKind): ProviderSettings {
  if (kind === 'openai') {
    return { kind, apiKey: env('OPENAI_API_KEY'), baseUrl: env('OPENAI_BASE_URL'), model: env('OPENAI_MODEL'), allowNetwork: env('TOOLPA_ALLOW_NETWORK') === '1' };
  }
  if (kind === 'anthropic') {
    return { kind, apiKey: env('ANTHROPIC_API_KEY'), baseUrl: env('ANTHROPIC_BASE_URL'), model: env('ANTHROPIC_MODEL'), allowNetwork: env('TOOLPA_ALLOW_NETWORK') === '1' };
  }
  return { kind, baseUrl: env('OLLAMA_BASE_URL'), model: env('OLLAMA_MODEL'), allowNetwork: env('TOOLPA_ALLOW_NETWORK') === '1' };
}

function endpoint(settings: ProviderSettings): { url: string; headers: Record<string, string>; body: string; prompt: string } {
  const defaults = DEFAULTS[settings.kind];
  const base = (settings.baseUrl ?? defaults.baseUrl).replace(/\/$/, '');
  const model = settings.model ?? defaults.model;
  if (!/^https?:\/\//.test(base)) throw new AgentError('MODEL_URL', 'MODEL_URL: the base URL must be http or https');
  if (settings.apiKey && (base.includes(settings.apiKey) || model.includes(settings.apiKey))) {
    throw new AgentError('MODEL_SECRET', 'MODEL_SECRET: the key must stay in the header');
  }
  return { url: base, headers: {}, body: '', prompt: model };
}

function requestFor(settings: ProviderSettings, prompt: string): { url: string; headers: Record<string, string>; body: string } {
  const target = endpoint(settings);
  const model = target.prompt;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.kind === 'openai') {
    if (!settings.apiKey) throw new AgentError('NOT_CONFIGURED', 'NOT_CONFIGURED: OPENAI_API_KEY is required');
    headers.authorization = `Bearer ${settings.apiKey}`;
    return {
      url: `${target.url}/chat/completions`,
      headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
    };
  }
  if (settings.kind === 'anthropic') {
    if (!settings.apiKey) throw new AgentError('NOT_CONFIGURED', 'NOT_CONFIGURED: ANTHROPIC_API_KEY is required');
    headers['x-api-key'] = settings.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    return {
      url: `${target.url}/v1/messages`,
      headers,
      body: JSON.stringify({ model, max_tokens: 256, messages: [{ role: 'user', content: prompt }] }),
    };
  }
  return {
    url: `${target.url}/api/chat`,
    headers,
    body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: prompt }] }),
  };
}

export function textFromProvider(kind: ProviderKind, payload: string): string {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    throw new AgentError('MODEL_RESPONSE', 'MODEL_RESPONSE: the provider did not return JSON');
  }
  const record = json as { choices?: { message?: { content?: unknown } }[]; content?: { text?: unknown }[]; message?: { content?: unknown } };
  const content =
    kind === 'openai'
      ? record.choices?.[0]?.message?.content
      : kind === 'anthropic'
        ? record.content?.map((block) => (typeof block.text === 'string' ? block.text : '')).join(' ')
        : record.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new AgentError('MODEL_RESPONSE', 'MODEL_RESPONSE: the provider returned no text');
  }
  return content;
}

export function wordsFromText(text: string): string[] {
  return text.trim().split(/\s+/).filter((word) => word.length > 0);
}

async function fetchTransport(url: string, headers: Record<string, string>, body: string): Promise<string> {
  const response = await fetch(url, { method: 'POST', headers, body });
  if (!response.ok) throw new AgentError('MODEL_HTTP', `MODEL_HTTP: ${response.status}`);
  return response.text();
}

export function createHostedModel(settings: ProviderSettings, trace?: Trace): ModelProvider {
  return {
    provider: 'remote',
    async complete(prompt: string): Promise<string[]> {
      const text = prompt.trim();
      if (!text) throw new AgentError('AGENT_EMPTY', 'AGENT_EMPTY: the prompt is empty');
      if (settings.allowNetwork !== true) {
        throw new AgentError('NOT_CONFIGURED', 'NOT_CONFIGURED: set TOOLPA_ALLOW_NETWORK=1 to call a hosted model');
      }
      const request = requestFor(settings, text);
      if (settings.apiKey && request.body.includes(settings.apiKey)) {
        throw new AgentError('MODEL_SECRET', 'MODEL_SECRET: the key must stay in the header');
      }
      const transport = settings.transport ?? { post: fetchTransport };
      try {
        const payload = await transport.post(request.url, request.headers, request.body);
        const words = wordsFromText(textFromProvider(settings.kind, payload));
        trace?.event('model.call', { kind: settings.kind, ok: true, words: words.length });
        return words;
      } catch (error) {
        trace?.event('model.call', { kind: settings.kind, ok: false, words: 0 });
        if (error instanceof AgentError) throw error;
        throw new AgentError('MODEL_HTTP', 'MODEL_HTTP: the provider call failed');
      }
    },
  };
}

export function hostedFromEnv(kind: ProviderKind, trace?: Trace): ModelProvider {
  return createHostedModel(settingsFromEnv(kind), trace);
}

export async function hostedAgentSelfCheck(): Promise<{ provider: string; hash: string; called: boolean; blocked: string }> {
  let called = false;
  const model = createHostedModel({
    kind: 'openai',
    apiKey: 'test-key',
    allowNetwork: true,
    baseUrl: 'http://127.0.0.1:9/v1',
    transport: {
      async post(_url, headers, body) {
        called = true;
        if (!headers.authorization?.startsWith('Bearer ') || body.includes('test-key')) throw new Error('secret leaked');
        return JSON.stringify({ choices: [{ message: { content: 'keys sine lowpass' } }] });
      },
    },
  });
  const built = await runAgent('keys sine lowpass', { maxAttempts: 1, model });
  let blocked = '';
  try {
    await createHostedModel({ kind: 'openai', apiKey: 'test-key', allowNetwork: false }).complete('keys sine lowpass');
  } catch (error) {
    blocked = error instanceof AgentError ? error.code : 'error';
  }
  return { provider: built.provider, hash: built.hash ?? '', called, blocked };
}
