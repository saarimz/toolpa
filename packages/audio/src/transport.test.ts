import { describe, expect, it } from 'vitest';
import { InputBus, InputError, openMicrophone } from './input.ts';
import { TransportError, beatToSeconds, secondsPerBeat } from './transport.ts';

describe('transport and the silent input bus', () => {
  it('maps one beat at 120 bpm to half a second', () => {
    expect(secondsPerBeat(120)).toBe(0.5);
    expect(beatToSeconds(1, 120)).toBe(0.5);
    expect(beatToSeconds(4, 120)).toBe(2);
    expect(() => secondsPerBeat(19)).toThrow(TransportError);
    expect(() => beatToSeconds(-1, 120)).toThrow(/TEMPO_RANGE/);
  });

  it('keeps a registered bus silent and refuses the microphone', () => {
    const bus = new InputBus();
    bus.register('mic');
    expect(bus.peak('mic')).toBe(0);
    expect(bus.read('mic').length).toBe(128);
    expect(() => bus.register('mic')).toThrow(InputError);
    expect(() => bus.register('mic')).toThrow(/INPUT_DUPLICATE/);
    expect(() => openMicrophone()).toThrow(/MIC_FOLLOWUP/);
  });
});
