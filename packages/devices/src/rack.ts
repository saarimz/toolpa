import { lowerEffects } from '@toolpa/audio';
import { canonicalize, sha256Hex, type Instrument, type ToneEffect } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';

export type DeviceRole = 'midi' | 'generator' | 'instrument' | 'effect';

export interface DeviceDef {
  id: string;
  role: DeviceRole;
  title: string;
  effect?: ToneEffect;
}

export class DeviceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DeviceError';
  }
}

const ROLES = new Set<DeviceRole>(['midi', 'generator', 'instrument', 'effect']);

export class DeviceRegistry {
  private readonly devices = new Map<string, DeviceDef>();

  register(device: DeviceDef, trace?: Trace): void {
    if (!/^[a-z0-9-]{1,32}$/.test(device.id)) throw new DeviceError('DEVICE_ID', 'DEVICE_ID: use 1 to 32 lowercase letters, digits, or hyphens');
    if (!ROLES.has(device.role)) throw new DeviceError('DEVICE_ROLE', 'DEVICE_ROLE: role is not midi, generator, instrument, or effect');
    if (this.devices.has(device.id)) throw new DeviceError('DEVICE_DUPLICATE', `DEVICE_DUPLICATE: ${device.id}`);
    if (device.role === 'effect' && device.effect?.type !== 'tone') {
      throw new DeviceError('DEVICE_EFFECT', 'DEVICE_EFFECT: an effect device needs a tone');
    }
    this.devices.set(device.id, device);
    trace?.event('device.register', { id: device.id, role: device.role });
  }

  get(id: string): DeviceDef {
    const device = this.devices.get(id);
    if (!device) throw new DeviceError('DEVICE_MISSING', `DEVICE_MISSING: ${id}`);
    return device;
  }

  list(role?: DeviceRole): DeviceDef[] {
    return [...this.devices.values()].filter((device) => !role || device.role === role);
  }
}

export async function composeRack(registry: DeviceRegistry, ids: readonly string[], trace?: Trace) {
  const devices = ids.map((id) => registry.get(id));
  const instrumentIndex = devices.findIndex((device) => device.role === 'instrument');
  if (instrumentIndex < 0) throw new DeviceError('RACK_INSTRUMENT', 'RACK_INSTRUMENT: a rack needs one instrument');
  if (devices.filter((device) => device.role === 'instrument').length > 1) {
    throw new DeviceError('RACK_ROLE', 'RACK_ROLE: a rack has one instrument');
  }
  if (devices.filter((device) => device.role === 'generator').length > 1) {
    throw new DeviceError('RACK_ROLE', 'RACK_ROLE: a rack has one generator');
  }
  devices.forEach((device, index) => {
    if ((device.role === 'midi' || device.role === 'generator') && index > instrumentIndex) {
      throw new DeviceError('RACK_ORDER', `RACK_ORDER: ${device.id} must come before the instrument`);
    }
    if (device.role === 'effect' && index < instrumentIndex) {
      throw new DeviceError('RACK_ORDER', `RACK_ORDER: ${device.id} must come after the instrument`);
    }
  });
  const document = {
    kind: 'rack',
    version: 1,
    devices: devices.map((device) => ({ id: device.id, role: device.role, title: device.title })),
  };
  const hash = await sha256Hex(canonicalize(document));
  const effects = devices.filter((device) => device.role === 'effect');
  trace?.event('rack.compose', { hash, devices: devices.length, effects: effects.length });
  return { devices, effects, hash };
}

export function lowerRack(instrument: Instrument, effects: readonly ToneEffect[], trace?: Trace) {
  return lowerEffects(instrument, [...effects], trace);
}

export async function rackSelfCheck(): Promise<{ effects: number; illegal: string; hash: string }> {
  const registry = new DeviceRegistry();
  registry.register({ id: 'keys', role: 'midi', title: 'Keys' });
  registry.register({ id: 'sine', role: 'instrument', title: 'Sine' });
  registry.register({
    id: 'tone',
    role: 'effect',
    title: 'Tone',
    effect: { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.3 },
  });
  let illegal = '';
  try {
    await composeRack(registry, ['tone', 'sine']);
  } catch (error) {
    illegal = error instanceof DeviceError ? error.code : 'error';
  }
  const legal = await composeRack(registry, ['keys', 'sine', 'tone']);
  return { effects: registry.list('effect').length, illegal, hash: legal.hash };
}
