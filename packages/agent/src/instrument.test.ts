import { describe, expect, it } from 'vitest';
import { AgentError } from './agent.ts';
import { cookbookShot, instrumentDsl, instrumentPrompt, mockInstrument, parsePromptInstrument, repairInstrument, runInstrumentAgent } from './instrument.ts';
import { explainModelHttp } from './providers.ts';

describe('prompt instrument agent', () => {
  it('lists every cookbook patch in the model prompt and reads fenced JSON', () => {
    const names = cookbookShot().split('\n');
    expect(names).toHaveLength(40);
    const prompt = instrumentPrompt('warm saw');
    for (const name of names) expect(prompt).toContain(name);
    const doc = mockInstrument('saw delay bass');
    expect(doc.oscillator).toBe('blepsaw');
    expect(doc.effect).toBe('delay');
    expect(doc.notes[0]?.midi).toBe(36);
    const wrapped = `A playable rack:\n\`\`\`json\n${JSON.stringify(doc)}\n\`\`\`\nThat is the instrument.`;
    expect(parsePromptInstrument(wrapped)).toEqual(doc);
    expect(parsePromptInstrument(`Here is the instrument. ${JSON.stringify(doc)} Play it.`)).toEqual(doc);
    expect(parsePromptInstrument(instrumentDsl(doc))).toEqual(doc);
  });

  it('repairs silence, clipping, and NaN, and stops at the attempt budget', async () => {
    let renders = 0;
    const silent = await runInstrumentAgent('quiet', {
      maxAttempts: 3,
      render: async (doc) => {
        renders += 1;
        return { peak: doc.voice.sustain >= 0.8 ? 0.4 : 0, nan: false };
      },
    });
    expect(renders).toBe(2);
    expect(silent.attempts).toBe(2);
    expect(silent.document.voice.sustain).toBeGreaterThanOrEqual(0.8);
    expect(silent.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(silent.rack).toMatch(/^[a-f0-9]{64}$/);

    const clipped = await runInstrumentAgent('loud', {
      maxAttempts: 3,
      render: async (doc) => ({ peak: doc.notes[0]?.velocity && doc.notes[0].velocity <= 72 ? 0.4 : 1.2, nan: false }),
    });
    expect(clipped.document.notes[0]?.velocity).toBeLessThanOrEqual(72);

    const seeded = mockInstrument('broken');
    seeded.lfoHz = 5;
    seeded.lfoDepthHz = 200;
    seeded.effect = 'distort';
    const unstable = await runInstrumentAgent('broken', {
      maxAttempts: 3,
      model: { provider: 'mock', label: 'mock', complete: async () => JSON.stringify(seeded) },
      render: async (doc) => ({ peak: doc.lfoDepthHz === 0 && doc.effect === 'dry' ? 0.3 : 1, nan: doc.lfoDepthHz !== 0 || doc.effect !== 'dry' }),
    });
    expect(unstable.document.effect).toBe('dry');
    expect(unstable.document.lfoDepthHz).toBe(0);

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
    expect(repairInstrument(mockInstrument('saw'), 'silence').effect).toBe('dry');
  });

  it('renders a mock saw with the synth, effect, and sampler primitives', async () => {
    const built = await runInstrumentAgent('bright saw delay drum', { maxAttempts: 3 });
    expect(built.provider).toBe('mock');
    expect(built.document.oscillator).toBe('blepsaw');
    expect(built.document.effect).toBe('delay');
    expect(built.document.sampler).toBe(true);
    expect(built.attempts).toBeGreaterThanOrEqual(1);
    expect(built.dsl).toContain('osc blepsaw');
  });
});
