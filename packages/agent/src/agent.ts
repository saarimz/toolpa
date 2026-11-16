import { DeviceRegistry, composeRack, type DeviceDef } from '@toolpa/devices';
import type { Trace } from '@toolpa/trace';

export interface Provenance {
  prompt: string;
  hash: string | null;
  attempts: number;
  provider: 'mock' | 'remote';
}

export class AgentError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export interface ModelProvider {
  readonly provider: 'mock' | 'remote';
  complete(prompt: string): string[];
}

const TONE = { type: 'tone' as const, cutoffHz: 2000, q: 0.7071067811865476, gain: 0.3 };

const CATALOG: Record<string, DeviceDef> = {
  keys: { id: 'keys', role: 'midi', title: 'Keys' },
  sine: { id: 'sine', role: 'instrument', title: 'Sine' },
  lowpass: { id: 'lowpass', role: 'effect', title: 'Lowpass', effect: TONE },
};

export class MockModel implements ModelProvider {
  readonly provider = 'mock' as const;
  complete(prompt: string): string[] {
    return prompt.trim().toLowerCase().split(/\s+/).filter((word) => word.length > 0);
  }
}

export class RemoteModel implements ModelProvider {
  readonly provider = 'remote' as const;
  complete(): string[] {
    throw new AgentError('NOT_CONFIGURED', 'NOT_CONFIGURED: a hosted chat model is not wired');
  }
}

export async function runAgent(
  prompt: string,
  options: { maxAttempts: number; model?: ModelProvider },
  trace?: Trace,
): Promise<Provenance> {
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 4) {
    throw new AgentError('AGENT_BUDGET', 'AGENT_BUDGET: maxAttempts must be an integer from 1 to 4');
  }
  const model = options.model ?? new MockModel();
  let lastError = 'AGENT_EMPTY';
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const words = model.complete(prompt);
      const registry = new DeviceRegistry();
      const ids: string[] = [];
      for (const word of words) {
        const device = CATALOG[word];
        if (!device) throw new AgentError('AGENT_UNKNOWN', `AGENT_UNKNOWN: ${word}`);
        if (!registry.list().some((item) => item.id === device.id)) registry.register(device, trace);
        ids.push(device.id);
      }
      const rack = await composeRack(registry, ids, trace);
      trace?.event('agent.turn', { attempt, maxAttempts: options.maxAttempts, ok: true });
      trace?.event('agent.audition', { hash: rack.hash, attempt });
      return { prompt, hash: rack.hash, attempts: attempt, provider: model.provider };
    } catch (error) {
      lastError = error instanceof AgentError ? error.code : 'error';
      trace?.event('agent.turn', { attempt, maxAttempts: options.maxAttempts, ok: false });
    }
  }
  trace?.event('agent.audition', { hash: '', attempt: options.maxAttempts, ok: false });
  throw new AgentError('AGENT_BUDGET', `AGENT_BUDGET: stopped after ${options.maxAttempts} attempts (${lastError})`);
}

export async function agentSelfCheck(): Promise<{ hash: string; budget: string; provider: string }> {
  const built = await runAgent('keys sine lowpass', { maxAttempts: 1 });
  let budget = '';
  try {
    await runAgent('lowpass sine', { maxAttempts: 1 });
  } catch (error) {
    budget = error instanceof AgentError ? error.code : 'error';
  }
  return { hash: built.hash ?? '', budget, provider: built.provider };
}
