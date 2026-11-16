import {
  AgentError,
  MockInstrumentModel,
  WORKERS_AI_MODEL,
  chainFromPrompt,
  remoteInstrumentModel,
  runInstrumentAgent,
  type ChatTransport,
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

export async function streamAgent(body: unknown, env: AgentEnv, write: (stage: InstrumentStage) => void, transport?: ChatTransport): Promise<void> {
  const prompt = body && typeof body === 'object' && typeof (body as { prompt?: unknown }).prompt === 'string' ? (body as { prompt: string }).prompt : '';
  const resolved = resolveAgent(env);
  const model = resolved.settings ? remoteInstrumentModel({ ...resolved.settings, transport }) : new MockInstrumentModel();
  try {
    const result = await runInstrumentAgent(prompt, { maxAttempts: 3, model, onStage: write });
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
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The agent failed.';
    const code = error instanceof AgentError ? error.code : 'error';
    write({ stage: 'error', code, detail });
  }
}

export function encodeStages(stages: readonly InstrumentStage[]): string {
  return stages.map((stage) => JSON.stringify(stage)).join('\n') + '\n';
}
