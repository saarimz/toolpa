import { describe, expect, it } from 'vitest';
import { countNodes } from '@toolpa/audio';
import type { Instrument } from '@toolpa/graph';
import { createTrace } from '@toolpa/trace';
import { DeviceError, DeviceRegistry, composeRack, lowerRack } from './rack.ts';

const tone = { type: 'tone' as const, cutoffHz: 2000, q: 0.7071067811865476, gain: 0.3 };

function registry(trace?: Parameters<DeviceRegistry['register']>[1]) {
  const devices = new DeviceRegistry();
  devices.register({ id: 'keys', role: 'midi', title: 'Keys' }, trace);
  devices.register({ id: 'euclid', role: 'generator', title: 'Euclid' }, trace);
  devices.register({ id: 'sine', role: 'instrument', title: 'Sine' }, trace);
  devices.register({ id: 'low', role: 'effect', title: 'Low', effect: tone }, trace);
  devices.register({ id: 'high', role: 'effect', title: 'High', effect: { ...tone, cutoffHz: 8000 } }, trace);
  return devices;
}

const instrument: Instrument = {
  kind: 'instrument',
  version: 1,
  sampleRate: 44100,
  voice: { type: 'sine', attackSeconds: 0.005, decaySeconds: 0.02, sustain: 0.8, releaseSeconds: 0.02 },
  maxVoices: 4,
  notes: [
    { midi: 60, startSeconds: 0, durationSeconds: 0.2, velocity: 100 },
    { midi: 64, startSeconds: 0, durationSeconds: 0.2, velocity: 90 },
    { midi: 67, startSeconds: 0, durationSeconds: 0.2, velocity: 80 },
  ],
  effect: tone,
};

describe('device racks', () => {
  it('rejects an effect before the instrument and a second instrument', async () => {
    const devices = registry();
    await expect(composeRack(devices, ['low', 'sine'])).rejects.toThrow(/RACK_ORDER/);
    devices.register({ id: 'other', role: 'instrument', title: 'Other' });
    await expect(composeRack(devices, ['sine', 'other'])).rejects.toThrow(DeviceError);
    expect(() => devices.register({ id: 'sine', role: 'midi', title: 'Again' })).toThrow(/DEVICE_DUPLICATE/);
  });

  it('hashes a legal rack and mounts one lowpass per effect', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const devices = registry(trace);
    const rack = await composeRack(devices, ['keys', 'euclid', 'sine', 'low', 'high'], trace);
    expect(rack.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rack.effects).toHaveLength(2);
    const lowered = lowerRack(instrument, rack.effects.map((device) => device.effect ?? tone), trace);
    expect(lowered.svf).toBe(2);
    expect(countNodes(lowered.node, 'svf')).toBe(2);
    expect(lowered.sounding).toHaveLength(3);
    const again = await composeRack(devices, ['keys', 'euclid', 'sine', 'low', 'high']);
    expect(again.hash).toBe(rack.hash);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('rack.compose');
    expect(names).toContain('device.register');
  });
});
