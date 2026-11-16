import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { composeStudio, describeExport, notesFromRoll } from './studio.ts';

describe('playground studio', () => {
  it('composes a legal rack and rejects an effect placed first', async () => {
    const legal = await composeStudio(['keys', 'sine', 'lowpass']);
    expect('hash' in legal ? legal.hash : '').toMatch(/^[a-f0-9]{64}$/);
    const illegal = await composeStudio(['lowpass', 'sine']);
    expect(illegal).toEqual({ error: 'RACK_ORDER' });
  });

  it('exports the roll as MIDI, SFZ, stems, and a sample pack', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const notes = notesFromRoll(['0:60', '2:64']);
    expect(notes).toEqual([
      { midi: 60, startTick: 0, durationTicks: 480, velocity: 100 },
      { midi: 64, startTick: 960, durationTicks: 480, velocity: 100 },
    ]);
    const midi = await describeExport('midi', notes, '', trace);
    expect(midi.startsWith('MIDI MThd ')).toBe(true);
    const sha = 'a'.repeat(64);
    const sfz = await describeExport('sfz', notes, sha, trace);
    expect(sfz).toBe(`sample=samples/${sha}.wav`);
    const stems = await describeExport('stems', notes, sha, trace);
    expect(stems).toMatch(/^stems [a-f0-9]{64}$/);
    const pack = await describeExport('pack', notes, sha, trace);
    expect(pack.startsWith('pack instrument.sfz samples/')).toBe(true);
    const names = lines.map((line) => (JSON.parse(line) as { name?: string }).name);
    expect(names).toContain('export.smf');
    expect(names).toContain('export.sfz');
    expect(names).toContain('export.stem');
    expect(names).toContain('export.pack');
  });
});