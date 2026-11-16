import type { Trace } from '@toolpa/trace';
import { AgentError, MockModel, runAgent, type ModelProvider } from './agent.ts';

export type ProviderKind =
  | 'vercel-gateway'
  | 'cloudflare-gateway'
  | 'openai-compatible'
  | 'openai'
  | 'anthropic'
  | 'ollama';

export interface ChatTransport {
  post(url: string, headers: Record<string, string>, body: string): Promise<string>;
}

export const WORKERS_AI_MODEL = 'workers-ai/@cf/openai/gpt-oss-120b';

export interface ProviderSettings {
  kind: ProviderKind;
  apiKey?: string;
  providerKey?: string;
  baseUrl?: string;
  model?: string;
  accountId?: string;
  gatewayId?: string;
  allowNetwork?: boolean;
  transport?: ChatTransport;
}

const DEFAULTS: Record<ProviderKind, { baseUrl: string; model: string }> = {
  'vercel-gateway': { baseUrl: 'https://ai-gateway.vercel.sh/v1', model: 'openai/gpt-4o-mini' },
  'cloudflare-gateway': { baseUrl: 'https://gateway.ai.cloudflare.com/v1', model: WORKERS_AI_MODEL },
  'openai-compatible': { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-latest' },
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'llama3.2' },
};

function env(name: string): string | undefined {
  const value = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  return value && value.length > 0 ? value : undefined;
}

function allowNetwork(): boolean {
  return env('TOOLPA_ALLOW_NETWORK') === '1';
}

function cloudflareAuthorization(model: string | undefined, gatewayToken: string | undefined): string | undefined {
  if (model?.startsWith('anthropic/')) return env('ANTHROPIC_API_KEY') ?? gatewayToken;
  if (model?.startsWith('openai/')) return env('OPENAI_API_KEY') ?? gatewayToken;
  return gatewayToken;
}

export function explainModelHttp(status: number): string {
  if (status === 403) {
    return 'MODEL_HTTP: 403 this Workers AI model is not on the current plan. @cf/moonshotai/kimi-k2.6 is paid-plan only. The default is workers-ai/@cf/openai/gpt-oss-120b.';
  }
  if (status === 410) {
    return 'MODEL_HTTP: 410 this Workers AI model is deprecated. @cf/meta/llama-3.1-8b-instruct is gone. Set TOOLPA_MODEL=workers-ai/@cf/openai/gpt-oss-120b.';
  }
  return `MODEL_HTTP: ${status}`;
}

export function settingsFromEnv(kind: ProviderKind): ProviderSettings {
  if (kind === 'vercel-gateway') {
    return {
      kind,
      apiKey: env('AI_GATEWAY_API_KEY'),
      baseUrl: env('AI_GATEWAY_BASE_URL'),
      model: env('TOOLPA_MODEL') ?? env('AI_GATEWAY_MODEL'),
      allowNetwork: allowNetwork(),
    };
  }
  if (kind === 'cloudflare-gateway') {
    return {
      kind,
      apiKey: env('CF_AIG_TOKEN'),
      providerKey: cloudflareAuthorization(env('TOOLPA_MODEL') ?? env('CF_AIG_MODEL'), env('CF_AIG_TOKEN')),
      baseUrl: env('CF_AIG_BASE_URL'),
      model: env('TOOLPA_MODEL') ?? env('CF_AIG_MODEL'),
      accountId: env('CF_ACCOUNT_ID'),
      gatewayId: env('CF_GATEWAY_ID'),
      allowNetwork: allowNetwork(),
    };
  }
  if (kind === 'openai' || kind === 'openai-compatible') {
    return { kind, apiKey: env('OPENAI_API_KEY'), baseUrl: env('OPENAI_BASE_URL'), model: env('OPENAI_MODEL'), allowNetwork: allowNetwork() };
  }
  if (kind === 'anthropic') {
    return { kind, apiKey: env('ANTHROPIC_API_KEY'), baseUrl: env('ANTHROPIC_BASE_URL'), model: env('ANTHROPIC_MODEL'), allowNetwork: allowNetwork() };
  }
  return { kind, baseUrl: env('OLLAMA_BASE_URL'), model: env('OLLAMA_MODEL'), allowNetwork: allowNetwork() };
}

export function providerFromEnv(trace?: Trace): ModelProvider {
  const selected = env('TOOLPA_MODEL_PROVIDER') ?? 'mock';
  if (selected === 'mock') return new MockModel();
  if (!isProviderKind(selected)) throw new AgentError('NOT_CONFIGURED', `NOT_CONFIGURED: unknown provider ${selected}`);
  const settings = settingsFromEnv(selected);
  return selected === 'vercel-gateway' || selected === 'cloudflare-gateway' ? new GatewayProvider(settings, trace) : createHostedModel(settings, trace);
}

function isProviderKind(value: string): value is ProviderKind {
  return value in DEFAULTS;
}

function segment(value: string | undefined, label: string): string {
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new AgentError('NOT_CONFIGURED', `NOT_CONFIGURED: ${label} is required`);
  }
  return value;
}

function endpoint(settings: ProviderSettings): { url: string; model: string } {
  const defaults = DEFAULTS[settings.kind];
  const model = settings.model ?? defaults.model;
  if (!model || /[\r\n]/.test(model)) throw new AgentError('MODEL_URL', 'MODEL_URL: the model id is empty');
  if (settings.apiKey && model.includes(settings.apiKey)) throw new AgentError('MODEL_SECRET', 'MODEL_SECRET: the key must stay in the header');
  if (settings.kind === 'cloudflare-gateway') {
    const accountId = segment(settings.accountId, 'CF_ACCOUNT_ID');
    const gatewayId = segment(settings.gatewayId, 'CF_GATEWAY_ID');
    const root = (settings.baseUrl ?? `${defaults.baseUrl}/${accountId}/${gatewayId}`).replace(/\/$/, '');
    if (!/^https?:\/\//.test(root)) throw new AgentError('MODEL_URL', 'MODEL_URL: the base URL must be http or https');
    if (settings.apiKey && root.includes(settings.apiKey)) throw new AgentError('MODEL_SECRET', 'MODEL_SECRET: the key must stay in the header');
    if (settings.providerKey && root.includes(settings.providerKey)) throw new AgentError('MODEL_SECRET', 'MODEL_SECRET: the key must stay in the header');
    return { url: `${root}/compat/chat/completions`, model };
  }
  const base = (settings.baseUrl ?? defaults.baseUrl).replace(/\/$/, '');
  if (!/^https?:\/\//.test(base)) throw new AgentError('MODEL_URL', 'MODEL_URL: the base URL must be http or https');
  if (settings.apiKey && base.includes(settings.apiKey)) throw new AgentError('MODEL_SECRET', 'MODEL_SECRET: the key must stay in the header');
  return { url: base, model };
}

export function requestFor(settings: ProviderSettings, prompt: string): { url: string; headers: Record<string, string>; body: string } {
  const target = endpoint(settings);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const chat = JSON.stringify({ model: target.model, messages: [{ role: 'user', content: prompt }] });
  if (settings.kind === 'vercel-gateway' || settings.kind === 'openai' || settings.kind === 'openai-compatible') {
    if (!settings.apiKey) throw new AgentError('NOT_CONFIGURED', 'NOT_CONFIGURED: an API key is required');
    headers.authorization = `Bearer ${settings.apiKey}`;
    const url = target.url.endsWith('/chat/completions') ? target.url : `${target.url}/chat/completions`;
    return { url, headers, body: chat };
  }
  if (settings.kind === 'cloudflare-gateway') {
    if (!settings.apiKey) throw new AgentError('NOT_CONFIGURED', 'NOT_CONFIGURED: CF_AIG_TOKEN is required');
    headers['cf-aig-authorization'] = `Bearer ${settings.apiKey}`;
    headers.authorization = `Bearer ${settings.providerKey ?? settings.apiKey}`;
    return { url: target.url, headers, body: chat };
  }
  if (settings.kind === 'anthropic') {
    if (!settings.apiKey) throw new AgentError('NOT_CONFIGURED', 'NOT_CONFIGURED: ANTHROPIC_API_KEY is required');
    headers['x-api-key'] = settings.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    return {
      url: `${target.url}/v1/messages`,
      headers,
      body: JSON.stringify({ model: target.model, max_tokens: 256, messages: [{ role: 'user', content: prompt }] }),
    };
  }
  return {
    url: `${target.url}/api/chat`,
    headers,
    body: JSON.stringify({ model: target.model, stream: false, messages: [{ role: 'user', content: prompt }] }),
  };
}

function openaiShaped(kind: ProviderKind): boolean {
  return kind === 'openai' || kind === 'openai-compatible' || kind === 'vercel-gateway' || kind === 'cloudflare-gateway';
}

export function textFromProvider(kind: ProviderKind, payload: string): string {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    throw new AgentError('MODEL_RESPONSE', 'MODEL_RESPONSE: the provider did not return JSON');
  }
  const record = json as {
    choices?: { message?: { content?: unknown; reasoning?: unknown } }[];
    content?: { text?: unknown }[];
    message?: { content?: unknown };
  };
  if (openaiShaped(kind)) {
    const message = record.choices?.[0]?.message;
    const content = message?.content;
    if (typeof content === 'string' && content.trim().length > 0) return content;
    if (typeof message?.reasoning === 'string' && message.reasoning.trim().length > 0) {
      throw new AgentError('MODEL_RESPONSE', 'MODEL_RESPONSE: the model returned reasoning without message content');
    }
    throw new AgentError('MODEL_RESPONSE', 'MODEL_RESPONSE: the provider returned no text');
  }
  const content = kind === 'anthropic'
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

function assertSecret(settings: ProviderSettings, request: { url: string; body: string }): void {
  for (const secret of [settings.apiKey, settings.providerKey]) {
    if (secret && (request.body.includes(secret) || request.url.includes(secret))) {
      throw new AgentError('MODEL_SECRET', 'MODEL_SECRET: the key must stay in the header');
    }
  }
}

export async function completeRaw(settings: ProviderSettings, prompt: string, trace?: Trace): Promise<string> {
  const text = prompt.trim();
  if (!text) throw new AgentError('AGENT_EMPTY', 'AGENT_EMPTY: the prompt is empty');
  if (settings.allowNetwork !== true) {
    throw new AgentError('NOT_CONFIGURED', 'NOT_CONFIGURED: set TOOLPA_ALLOW_NETWORK=1 to call a hosted model');
  }
  const request = requestFor(settings, text);
  assertSecret(settings, request);
  const transport = settings.transport ?? { post: fetchTransport };
  try {
    const payload = await transport.post(request.url, request.headers, request.body);
    const reply = textFromProvider(settings.kind, payload);
    trace?.event('model.call', { kind: settings.kind, ok: true, words: wordsFromText(reply).length });
    return reply;
  } catch (error) {
    trace?.event('model.call', { kind: settings.kind, ok: false, words: 0 });
    if (error instanceof AgentError) throw error;
    throw new AgentError('MODEL_HTTP', 'MODEL_HTTP: the provider call failed');
  }
}

async function fetchTransport(url: string, headers: Record<string, string>, body: string): Promise<string> {
  const response = await fetch(url, { method: 'POST', headers, body });
  if (!response.ok) throw new AgentError('MODEL_HTTP', explainModelHttp(response.status));
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
      assertSecret(settings, request);
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

export class GatewayProvider implements ModelProvider {
  readonly provider = 'remote' as const;
  private readonly inner: ModelProvider;

  constructor(settings: ProviderSettings, trace?: Trace) {
    if (settings.kind !== 'vercel-gateway' && settings.kind !== 'cloudflare-gateway') {
      throw new AgentError('NOT_CONFIGURED', 'NOT_CONFIGURED: GatewayProvider needs vercel-gateway or cloudflare-gateway');
    }
    this.inner = createHostedModel(settings, trace);
  }

  complete(prompt: string): Promise<string[]> {
    return this.inner.complete(prompt);
  }
}

export function hostedFromEnv(kind: ProviderKind, trace?: Trace): ModelProvider {
  const settings = settingsFromEnv(kind);
  return kind === 'vercel-gateway' || kind === 'cloudflare-gateway' ? new GatewayProvider(settings, trace) : createHostedModel(settings, trace);
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

export async function gatewaySelfCheck(): Promise<{ vercel: string; cloudflare: string; model: string; notes: number }> {
  let vercel = '';
  let cloudflare = '';
  let model = '';
  const vercelModel = new GatewayProvider({
    kind: 'vercel-gateway',
    apiKey: 'gw-key',
    allowNetwork: true,
    model: 'anthropic/claude-haiku',
    transport: {
      async post(url, headers, body) {
        vercel = url;
        model = (JSON.parse(body) as { model: string }).model;
        if (!headers.authorization?.startsWith('Bearer ') || body.includes('gw-key') || url.includes('gw-key')) throw new Error('secret leaked');
        return JSON.stringify({ choices: [{ message: { content: '60:0:90 64:2:80' } }] });
      },
    },
  });
  const words = await vercelModel.complete('bass line');
  const cloudflareModel = new GatewayProvider({
    kind: 'cloudflare-gateway',
    apiKey: 'cf-token',
    accountId: 'acct1',
    gatewayId: 'gw1',
    allowNetwork: true,
    model: 'openai/gpt-4o-mini',
    transport: {
      async post(url, headers, body) {
        cloudflare = url;
        if (!headers['cf-aig-authorization']?.startsWith('Bearer ') || body.includes('cf-token') || url.includes('cf-token')) throw new Error('secret leaked');
        return JSON.stringify({ choices: [{ message: { content: 'keys sine lowpass' } }] });
      },
    },
  });
  await cloudflareModel.complete('keys sine lowpass');
  return { vercel, cloudflare, model, notes: words.length };
}
