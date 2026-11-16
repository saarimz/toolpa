import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { AgentError, RemoteModel, agentSelfCheck, runAgent } from './agent.ts';

describe('agent loop', () => {
  it('builds the same rack hash from a prompt', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const first = await runAgent('keys sine lowpass', { maxAttempts: 2 }, trace);
    const second = await runAgent('keys sine lowpass', { maxAttempts: 1 });
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.hash).toBe(first.hash);
    expect(first.provider).toBe('mock');
    expect(first.attempts).toBe(1);
    expect(JSON.stringify(first)).not.toMatch(/secret|api[_-]?key/i);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('agent.turn');
    expect(names).toContain('agent.audition');
  });

  it('stops when the rack is illegal and the budget is one attempt', async () => {
    await expect(runAgent('lowpass sine', { maxAttempts: 1 })).rejects.toThrow(/AGENT_BUDGET/);
    await expect(runAgent('sine sine', { maxAttempts: 1 })).rejects.toThrow(AgentError);
    expect(() => new RemoteModel().complete('sine')).toThrow(/NOT_CONFIGURED/);
  });

  it('matches the browser self-check', async () => {
    const check = await agentSelfCheck();
    expect(check.provider).toBe('mock');
    expect(check.budget).toBe('AGENT_BUDGET');
    expect(check.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
