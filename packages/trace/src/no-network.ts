const CALLS = [
  { name: 'fetch', pattern: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /new\s+XMLHttpRequest\b/ },
  { name: 'WebSocket', pattern: /new\s+WebSocket\b/ },
  { name: 'sendBeacon', pattern: /\bsendBeacon\s*\(/ },
];

export function findNetworkCalls(source: string): string[] {
  return CALLS.filter((call) => call.pattern.test(source)).map((call) => call.name);
}

export function assertNoNetwork(source: string): void {
  const hits = findNetworkCalls(source);
  if (hits.length > 0) throw new Error(`trace telemetry must not call ${hits.join(', ')}`);
}
