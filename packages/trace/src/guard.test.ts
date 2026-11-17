import { afterEach, describe, expect, it } from 'vitest';
import {
  clearNetworkAttempts,
  createTrace,
  installNetworkGuard,
  networkAttempts,
  uninstallNetworkGuard,
} from './index.ts';

describe('network guard', () => {
  afterEach(() => {
    uninstallNetworkGuard();
    clearNetworkAttempts();
    installNetworkGuard();
  });

  it('fails any fetch, XHR, WebSocket, or beacon and records the attempt', async () => {
    uninstallNetworkGuard();
    clearNetworkAttempts();
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    installNetworkGuard({ trace });

    await expect(fetch('https://example.com/collect')).rejects.toThrow(/blocked network fetch/);
    expect(() => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://example.com/xhr');
      xhr.send();
    }).toThrow(/blocked network xhr/);
    expect(() => new WebSocket('wss://example.com/socket')).toThrow(/blocked network websocket/);
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      expect(() => navigator.sendBeacon('https://example.com/beacon', 'x')).toThrow(/blocked network beacon/);
    }

    const apis = networkAttempts().map((attempt) => attempt.api);
    expect(apis).toContain('fetch');
    expect(apis).toContain('xhr');
    expect(apis).toContain('websocket');
    const blocked = lines.map((line) => JSON.parse(line.trim())).filter((record) => record.name === 'net.blocked');
    expect(blocked.length).toBeGreaterThanOrEqual(3);
    expect(blocked.every((record) => record.level === 'error')).toBe(true);
  });

  it('allows a target only when the predicate says so', async () => {
    uninstallNetworkGuard();
    clearNetworkAttempts();
    installNetworkGuard({
      allow: (target) => target.startsWith('http://127.0.0.1'),
    });

    await expect(fetch('https://example.com/nope')).rejects.toThrow(/blocked network fetch/);
    expect(networkAttempts().some((attempt) => attempt.target === 'https://example.com/nope')).toBe(true);
  });
});
