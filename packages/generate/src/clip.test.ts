import { describe, expect, it } from 'vitest';
import { renderInstrument } from '@toolpa/audio';
import { createTrace } from '@toolpa/trace';
import { clipDocument, launchClip } from './clip.ts';
import { euclidean } from './generate.ts';

describe('launched clips', () => {
  it('renders the same bytes as the scheduled instrument', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const pulses = euclidean(8, 3);
    const launched = await launchClip(pulses, 48, 120, trace);
    const clip = clipDocument(pulses, 48, 120);
    const direct = await renderInstrument({ instrument: clip.instrument, durationSeconds: clip.durationSeconds });
    expect(launched.hash).toBe(direct.hash);
    expect(launched.wav).toEqual(direct.wav);
    expect(clip.stepSeconds).toBe(0.25);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('transport.launch');
  });
});
