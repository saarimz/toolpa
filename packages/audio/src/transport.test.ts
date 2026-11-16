import { describe, expect, it } from 'vitest';
import { InputBus, InputError, captureMicrophone, openMicrophone } from './input.ts';
import { createTrace } from '@toolpa/trace';
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

  it('delays a live capture by the output latency and can mute the monitor', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const silent = await captureMicrophone({ live: false, trace });
    expect(silent.bus.peak('mic')).toBe(0);
    expect(silent.live).toBe(false);
    const frames = new Float32Array(128).fill(0.25);
    const live = await captureMicrophone({
      live: true,
      monitor: false,
      trace,
      getUserMedia: async () => ({ sampleRate: 44100, outputLatency: 10 / 44100, inputLatency: 0, frames }),
    });
    expect(live.delayFrames).toBe(10);
    expect(live.bus.read('mic')[0]).toBe(0);
    expect(live.bus.read('mic')[10]).toBeCloseTo(0.25);
    expect(live.monitorPeak).toBe(0);
    expect(live.bus.peak('mic')).toBeCloseTo(0.25);
    const heard = await captureMicrophone({
      live: true,
      monitor: true,
      getUserMedia: async () => ({ sampleRate: 44100, outputLatency: 0, inputLatency: 0.01, frames }),
    });
    expect(heard.delayFrames).toBe(0);
    expect(heard.monitorPeak).toBeCloseTo(0.25);
    await expect(captureMicrophone({ live: true })).rejects.toThrow(/MIC_UNAVAILABLE/);
    const bad = new Float32Array([0.1, Number.NaN]);
    await expect(
      captureMicrophone({
        live: true,
        getUserMedia: async () => ({ sampleRate: 44100, outputLatency: 0, inputLatency: 0, frames: bad }),
      }),
    ).rejects.toThrow(/INPUT_NAN/);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('input.open');
  });
});
