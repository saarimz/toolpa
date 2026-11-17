import { describe, expect, it } from 'vitest';
import { sha256Hex, canonicalize } from '@toolpa/graph';
import { AgentError } from './agent.ts';
import { applyMacro, cookbookShot, fewShotExamples, instrumentDsl, instrumentPrompt, mockInstrument, parsePromptInstrument, repairInstrument, runInstrumentAgent } from './instrument.ts';
import { explainModelHttp } from './providers.ts';

const padPrompt = 'warm detuned pad with slow filter sweep and a little reverb';
const bassPrompt = 'punchy analog bass with a short envelope';

describe('prompt instrument agent', () => {
  it('lists cookbook names and reads fenced JSON', () => {
    const names = cookbookShot().split('\n');
    expect(names).toHaveLength(40);
    const prompt = instrumentPrompt('warm saw');
    for (const name of names) expect(prompt).toContain(name);
    expect(prompt).toContain('prompt-instrument');
    expect(fewShotExamples().length).toBeGreaterThanOrEqual(6);
    expect(fewShotExamples().length).toBeLessThanOrEqual(10);
    const doc = mockInstrument('saw delay bass');
    expect(doc.oscillators.some((osc) => osc.wave === 'saw')).toBe(true);
    expect(doc.effects.some((effect) => effect.type === 'delay')).toBe(true);
    expect(doc.notes[0]?.midi).toBe(36);
    const wrapped = `A playable rack:\n\`\`\`json\n${JSON.stringify(doc)}\n\`\`\`\nThat is the instrument.`;
    expect(parsePromptInstrument(wrapped)).toEqual(doc);
    expect(parsePromptInstrument(`Here is the instrument. ${JSON.stringify(doc)} Play it.`)).toEqual(doc);
    expect(parsePromptInstrument(instrumentDsl(doc)).name).toBe(doc.name);
    expect(parsePromptInstrument(instrumentDsl(doc)).oscillators[0]?.wave).toBe(doc.oscillators[0]?.wave);
  });

  it('gives different prompts different instruments and does not invent one when the model fails', async () => {
    const pad = mockInstrument(padPrompt);
    const bass = mockInstrument(bassPrompt);
    expect(pad.filter.cutoffHz).toBeGreaterThan(bass.filter.cutoffHz);
    expect(pad.effects.some((effect) => effect.type === 'reverb')).toBe(true);
    expect(bass.amp.decaySeconds).toBeLessThan(pad.amp.decaySeconds);
    expect(await sha256Hex(canonicalize(pad))).not.toBe(await sha256Hex(canonicalize(bass)));

    const replies = new Map<string, string>([
      [padPrompt, JSON.stringify(pad)],
      [bassPrompt, JSON.stringify(bass)],
    ]);
    const model = {
      provider: 'remote' as const,
      label: 'stub',
      complete: ({ user }: { user: string; feedback: string }) => Promise.resolve(replies.get(user) ?? 'not-json'),
    };
    const first = await runInstrumentAgent(padPrompt, { maxAttempts: 2, model, render: async () => ({ peak: 0.4, nan: false }) });
    const second = await runInstrumentAgent(bassPrompt, { maxAttempts: 2, model, render: async () => ({ peak: 0.4, nan: false }) });
    expect(first.hash).not.toBe(second.hash);
    expect(first.document.name).not.toBe(second.document.name);
    expect(first.adjusted).toBe(false);

    const calls: string[] = [];
    await expect(runInstrumentAgent('broken prompt', {
      maxAttempts: 3,
      model: {
        provider: 'remote',
        label: 'stub',
        complete: ({ feedback }) => {
          calls.push(feedback);
          return Promise.resolve('not json at all');
        },
      },
      render: async () => ({ peak: 0.4, nan: false }),
    })).rejects.toThrow(/AGENT_BUDGET/);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toMatch(/JSON/);
    expect(calls.join(' ')).not.toMatch(/mockInstrument/);
  });

  it('repairs only render quality and stops at the attempt budget', async () => {
    let renders = 0;
    const silent = await runInstrumentAgent('quiet', {
      maxAttempts: 3,
      render: async (doc) => {
        renders += 1;
        return { peak: doc.amp.sustain >= 0.8 ? 0.4 : 0, nan: false };
      },
    });
    expect(renders).toBe(2);
    expect(silent.attempts).toBe(2);
    expect(silent.adjusted).toBe(true);
    expect(silent.document.amp.sustain).toBeGreaterThanOrEqual(0.8);
    expect(silent.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(silent.rack).toMatch(/^[a-f0-9]{64}$/);

    const clipped = await runInstrumentAgent('loud', {
      maxAttempts: 3,
      render: async (doc) => ({ peak: doc.notes[0]?.velocity && doc.notes[0].velocity <= 72 ? 0.4 : 1.2, nan: false }),
    });
    expect(clipped.document.notes[0]?.velocity).toBeLessThanOrEqual(72);
    expect(clipped.adjusted).toBe(true);

    const seeded = mockInstrument('broken');
    seeded.lfos = [{ rateHz: 5, depth: 0.8, target: 'cutoff' }];
    seeded.effects = [{ type: 'distortion', params: { mix: 0.5, drive: 8 } }];
    const unstable = await runInstrumentAgent('broken', {
      maxAttempts: 3,
      model: { provider: 'mock', label: 'mock', complete: async () => JSON.stringify(seeded) },
      render: async (doc) => ({ peak: doc.lfos.every((lfo) => lfo.depth === 0) && doc.effects.every((effect) => (effect.params.mix ?? 1) === 0) ? 0.3 : 1, nan: doc.lfos.some((lfo) => lfo.depth !== 0) || doc.effects.some((effect) => (effect.params.mix ?? 0) > 0) }),
    });
    expect(unstable.document.lfos.every((lfo) => lfo.depth === 0)).toBe(true);
    expect(unstable.document.effects.every((effect) => effect.params.mix === 0)).toBe(true);

    await expect(
      runInstrumentAgent('never', { maxAttempts: 2, render: async () => ({ peak: 0, nan: false }) }),
    ).rejects.toThrow(/AGENT_BUDGET/);

    await expect(
      runInstrumentAgent('paid model', {
        maxAttempts: 3,
        model: {
          provider: 'remote',
          label: 'cloudflare-gateway',
          complete: () => Promise.reject(new AgentError('MODEL_HTTP', explainModelHttp(403))),
        },
        render: async () => ({ peak: 0.4, nan: false }),
      }),
    ).rejects.toThrow(/403/);
    expect(repairInstrument(mockInstrument('saw'), 'silence').effects.every((effect) => (effect.params.mix ?? 0) === 0)).toBe(true);
    const turned = applyMacro(mockInstrument('lead'), 'cutoff', 2400);
    expect(turned.filter.cutoffHz).toBe(2400);
    expect(turned.macros[0]?.value).toBe(2400);
  });

  it('renders a mock saw through the delay', async () => {
    const built = await runInstrumentAgent('bright saw delay', { maxAttempts: 2 });
    expect(built.provider).toBe('mock');
    expect(built.document.oscillators.some((osc) => osc.wave === 'saw')).toBe(true);
    expect(built.document.effects.some((effect) => effect.type === 'delay')).toBe(true);
    expect(built.attempts).toBeGreaterThanOrEqual(1);
    expect(built.dsl).toContain('osc saw');
  });
});