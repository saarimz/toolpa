import type { InstrumentStage } from '@toolpa/agent';

export const AGENT_TIMEOUT_MS = 90_000;

export interface AgentStatus {
  provider: string;
  label: string;
  model: string;
  configured: boolean;
  notice: string;
}

function timeoutMessage(timeoutMs: number): string {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `The agent timed out after ${seconds}s.`;
}

function aborted(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export async function readAgentStatus(timeoutMs = 10_000): Promise<AgentStatus> {
  try {
    const response = await fetch('/api/agent/status', { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error('The model status could not be read.');
    return (await response.json()) as AgentStatus;
  } catch (error) {
    if (aborted(error)) throw new Error(timeoutMessage(timeoutMs));
    throw error;
  }
}

async function readStages(response: Response, onStage: (stage: InstrumentStage) => void): Promise<InstrumentStage> {
  if (!response.body) throw new Error('The agent returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let last: InstrumentStage | null = null;
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      const stage = JSON.parse(line) as InstrumentStage;
      last = stage;
      onStage(stage);
    }
    if (chunk.done) break;
  }
  if (buffer.trim().length > 0) {
    const stage = JSON.parse(buffer) as InstrumentStage;
    last = stage;
    onStage(stage);
  }
  if (!last) throw new Error('The agent returned an empty response.');
  return last;
}

export async function streamInstrument(
  prompt: string,
  onStage: (stage: InstrumentStage) => void,
  options?: { timeoutMs?: number },
): Promise<InstrumentStage> {
  const timeoutMs = options?.timeoutMs ?? AGENT_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(timeoutMessage(timeoutMs)));
    }, timeoutMs);
  });
  const work = (async () => {
    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    return readStages(response, onStage);
  })();
  void work.catch(() => undefined);
  try {
    return await Promise.race([work, timeout]);
  } catch (error) {
    if (aborted(error)) throw new Error(timeoutMessage(timeoutMs));
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
