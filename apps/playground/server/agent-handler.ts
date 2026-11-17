import {
  AgentError,
  MockInstrumentModel,
  WORKERS_AI_MODEL,
  chainFromPrompt,
  completionMeta,
  explainModelHttp,
  remoteInstrumentModel,
  runInstrumentAgent,
  type ChatTransport,
  type InstrumentModel,
  type InstrumentStage,
  type ProviderSettings,
} from '@toolpa/agent';

export interface AgentEnv {
  TOOLPA_MODEL_PROVIDER?: string;
  TOOLPA_MODEL?: string;
  TOOLPA_ALLOW_NETWORK?: string;
  CF_AIG_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_GATEWAY_ID?: string;
  CF_AIG_MODEL?: string;
  CF_AIG_BASE_URL?: string;
  AI_GATEWAY_API_KEY?: string;
  AI_GATEWAY_MODEL?: string;
  AI_GATEWAY_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
}

export interface ResolvedAgent {
  notice: string;
  settings?: ProviderSettings;
}

export interface AgentStatus {
  provider: string;
  label: string;
  model: string;
  configured: boolean;
  notice: string;
}

export interface AgentLog {
  event: 'request' | 'stage' | 'upstream';
  provider: string;
  model: string;
  stage?: string;
  status?: number;
  promptChars?: number;
  finishReason?: string;
  contentLength?: number;
}

export const AGENT_STREAM_HEADERS: Record<string, string> = {
  'content-type': 'application/x-ndjson; charset=utf-8',
  'cache-control': 'no-cache',
  'x-accel-buffering': 'no',
};

export function writeStage(res: { write(chunk: string): unknown; flush?: () => void }, stage: InstrumentStage): void {
  res.write(`${JSON.stringify(stage)}\n`);
  res.flush?.();
}

function present(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function authorization(model: string, env: AgentEnv, gatewayToken: string): string {
  if (model.startsWith('anthropic/')) return present(env.ANTHROPIC_API_KEY) ?? gatewayToken;
  if (model.startsWith('openai/')) return present(env.OPENAI_API_KEY) ?? gatewayToken;
  return gatewayToken;
}

export function resolveAgent(env: AgentEnv): ResolvedAgent {
  const provider = present(env.TOOLPA_MODEL_PROVIDER) ?? 'mock';
  const network = env.TOOLPA_ALLOW_NETWORK === '1';
  const token = present(env.CF_AIG_TOKEN);
  const accountId = present(env.CF_ACCOUNT_ID);
  const gatewayId = present(env.CF_GATEWAY_ID);
  const model = present(env.TOOLPA_MODEL) ?? present(env.CF_AIG_MODEL) ?? WORKERS_AI_MODEL;
  if (provider === 'cloudflare-gateway' || (provider === 'mock' && token && accountId && gatewayId)) {
    if (!token || !accountId || !gatewayId) {
      return { notice: 'Cloudflare needs CF_AIG_TOKEN, CF_ACCOUNT_ID, and CF_GATEWAY_ID. Using the mock model.' };
    }
    if (!network) return { notice: 'Set TOOLPA_ALLOW_NETWORK=1 before the proxy calls Cloudflare. Using the mock model.' };
    if (model.startsWith('anthropic/') && !present(env.ANTHROPIC_API_KEY)) {
      return { notice: 'That model needs ANTHROPIC_API_KEY on the server. Using the mock model.' };
    }
    if (model.startsWith('openai/') && !present(env.OPENAI_API_KEY)) {
      return { notice: 'That model needs OPENAI_API_KEY on the server. Using the mock model.' };
    }
    return {
      notice: `Cloudflare AI Gateway · ${model}`,
      settings: {
        kind: 'cloudflare-gateway',
        apiKey: token,
        providerKey: authorization(model, env, token),
        accountId,
        gatewayId,
        model,
        baseUrl: present(env.CF_AIG_BASE_URL),
        allowNetwork: true,
      },
    };
  }
  if (provider === 'vercel-gateway') {
    const key = present(env.AI_GATEWAY_API_KEY);
    if (!key) return { notice: 'Vercel needs AI_GATEWAY_API_KEY. Using the mock model.' };
    if (!network) return { notice: 'Set TOOLPA_ALLOW_NETWORK=1 before the proxy calls Vercel. Using the mock model.' };
    const vercelModel = present(env.TOOLPA_MODEL) ?? present(env.AI_GATEWAY_MODEL) ?? 'openai/gpt-4o-mini';
    return {
      notice: `Vercel AI Gateway · ${vercelModel}`,
      settings: {
        kind: 'vercel-gateway',
        apiKey: key,
        model: vercelModel,
        baseUrl: present(env.AI_GATEWAY_BASE_URL),
        allowNetwork: true,
      },
    };
  }
  if (provider === 'openai-compatible' || provider === 'openai') {
    const key = present(env.OPENAI_API_KEY);
    if (!key || !network) return { notice: 'Direct OpenAI needs OPENAI_API_KEY and TOOLPA_ALLOW_NETWORK=1. Using the mock model.' };
    return {
      notice: 'OpenAI-compatible endpoint.',
      settings: {
        kind: 'openai-compatible',
        apiKey: key,
        model: present(env.TOOLPA_MODEL) ?? present(env.OPENAI_MODEL),
        baseUrl: present(env.OPENAI_BASE_URL),
        allowNetwork: true,
      },
    };
  }
  if (provider === 'ollama') {
    if (!network) return { notice: 'Set TOOLPA_ALLOW_NETWORK=1 before the proxy calls Ollama. Using the mock model.' };
    return {
      notice: 'Ollama.',
      settings: { kind: 'ollama', model: present(env.TOOLPA_MODEL) ?? present(env.OLLAMA_MODEL), baseUrl: present(env.OLLAMA_BASE_URL), allowNetwork: true },
    };
  }
  return { notice: 'No gateway key is configured. Using the mock model.' };
}

export function agentStatus(env: AgentEnv): AgentStatus {
  const resolved = resolveAgent(env);
  if (!resolved.settings) {
    return { provider: 'mock', label: 'mock', model: '', configured: false, notice: resolved.notice };
  }
  const model = resolved.settings.model ?? '';
  return {
    provider: resolved.settings.kind,
    label: resolved.settings.kind,
    model,
    configured: true,
    notice: resolved.notice,
  };
}

function statusCode(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  const match = message.match(/MODEL_HTTP:\s*(\d{3})/);
  return match ? Number(match[1]) : 0;
}

function observe(inner: ChatTransport, onStatus?: (status: number, finishReason?: string, contentLength?: number) => void): ChatTransport {
  return {
    async post(url, headers, body) {
      try {
        const payload = await inner.post(url, headers, body);
        const meta = completionMeta(payload);
        onStatus?.(200, meta.finishReason, meta.contentLength);
        return payload;
      } catch (error) {
        onStatus?.(statusCode(error));
        throw error;
      }
    },
  };
}

async function fetchLogged(url: string, headers: Record<string, string>, body: string, onStatus?: (status: number, finishReason?: string, contentLength?: number) => void): Promise<string> {
  const response = await fetch(url, { method: 'POST', headers, body });
  const payload = await response.text();
  const meta = completionMeta(payload);
  onStatus?.(response.status, meta.finishReason, meta.contentLength);
  if (!response.ok) throw new AgentError('MODEL_HTTP', explainModelHttp(response.status));
  return payload;
}

function withHeartbeat(model: InstrumentModel, write: (stage: InstrumentStage) => void, heartbeatMs: number): InstrumentModel {
  return {
    provider: model.provider,
    label: model.label,
    async complete(input) {
      const started = Date.now();
      let open = true;
      const timer = setInterval(() => {
        if (!open) return;
        const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
        write({ stage: 'wait', attempt: 1, detail: `waiting for model (${seconds}s)` });
      }, heartbeatMs);
      timer.unref?.();
      try {
        return await model.complete(input);
      } finally {
        open = false;
        clearInterval(timer);
      }
    },
  };
}

export async function streamAgent(
  body: unknown,
  env: AgentEnv,
  write: (stage: InstrumentStage) => void,
  transport?: ChatTransport,
  options?: { heartbeatMs?: number; log?: (entry: AgentLog) => void },
): Promise<void> {
  const prompt = body && typeof body === 'object' && typeof (body as { prompt?: unknown }).prompt === 'string' ? (body as { prompt: string }).prompt : '';
  const resolved = resolveAgent(env);
  const status = agentStatus(env);
  const log = options?.log;
  log?.({ event: 'request', provider: status.provider, model: status.model, promptChars: prompt.length });
  const onStatus = (code: number, finishReason?: string, contentLength?: number) => log?.({
    event: 'upstream',
    provider: status.provider,
    model: status.model,
    status: code,
    finishReason,
    contentLength,
  });
  const logged = transport ? observe(transport, onStatus) : { post: (url: string, headers: Record<string, string>, payload: string) => fetchLogged(url, headers, payload, onStatus) };
  const model = resolved.settings ? remoteInstrumentModel({ ...resolved.settings, transport: logged }) : new MockInstrumentModel();
  let announced = false;
  const emit = (stage: InstrumentStage) => {
    const next: InstrumentStage = stage.stage === 'plan' && !announced
      ? { ...stage, detail: `${status.label}: ${stage.detail}`, label: status.label, notice: status.notice }
      : stage;
    if (stage.stage === 'plan') announced = true;
    log?.({ event: 'stage', provider: status.provider, model: status.model, stage: next.stage });
    write(next);
  };
  try {
    const result = await runInstrumentAgent(prompt, { maxAttempts: 3, model: withHeartbeat(model, emit, options?.heartbeatMs ?? 2000), onStage: emit });
    write({
      stage: 'done',
      provider: model.provider,
      label: model.label,
      notice: resolved.notice,
      hash: result.hash,
      rack: result.rack,
      document: result.document,
      dsl: result.dsl,
      chain: chainFromPrompt(result.document),
      attempt: result.attempts,
      adjusted: result.adjusted,
      description: result.document.description,
    });
    log?.({ event: 'stage', provider: status.provider, model: status.model, stage: 'done' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The agent failed.';
    const code = error instanceof AgentError ? error.code : 'error';
    write({ stage: 'error', code, detail });
    log?.({ event: 'stage', provider: status.provider, model: status.model, stage: 'error' });
  }
}

export function encodeStages(stages: readonly InstrumentStage[]): string {
  return stages.map((stage) => JSON.stringify(stage)).join('\n') + '\n';
}
