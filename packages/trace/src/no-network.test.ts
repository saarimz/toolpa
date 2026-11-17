import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertNoNetwork, findNetworkCalls } from './no-network.ts';

describe('trace network isolation', () => {
  it('fails when telemetry source contains a network call', () => {
    expect(findNetworkCalls('fetch("https://example.com/collect")')).toEqual(['fetch']);
    expect(() => assertNoNetwork('navigator.sendBeacon("https://example.com", "x")')).toThrow(/sendBeacon/);
    expect(() => assertNoNetwork('new WebSocket("wss://example.com")')).toThrow(/WebSocket/);
    expect(() => assertNoNetwork('new XMLHttpRequest()')).toThrow(/XMLHttpRequest/);
  });

  it('the trace implementation does not call the network', () => {
    const files = readdirSync(new URL('.', import.meta.url))
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(3);
    for (const name of files) {
      const source = readFileSync(new URL(name, import.meta.url), 'utf8');
      expect(findNetworkCalls(source), name).toEqual([]);
    }
  });
});