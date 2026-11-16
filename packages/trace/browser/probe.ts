import { createTrace, installNetworkGuard, MemoryRing } from '../src/index.ts';

const ring = new MemoryRing(64);
const { trace } = createTrace({ ring });
installNetworkGuard({ trace });

const api = {
  snapshot: () => ring.snapshot(),
  ping: () => {
    trace.event('probe.ping', { ok: true });
  },
  tryFetch: async (url: string) => {
    try {
      await fetch(url);
      return 'allowed' as const;
    } catch {
      return 'blocked' as const;
    }
  },
};

declare global {
  interface Window {
    __toolpaTrace: typeof api;
  }
}

window.__toolpaTrace = api;
