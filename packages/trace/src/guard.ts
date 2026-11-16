import type { Trace } from './trace.ts';

export type NetworkApi = 'fetch' | 'xhr' | 'websocket' | 'beacon';

export interface NetworkAttempt {
  api: NetworkApi;
  target: string;
}

export interface NetworkGuardOptions {
  allow?: (target: string) => boolean;
  trace?: Trace;
}

interface GuardState {
  allow: (target: string) => boolean;
  trace?: Trace;
  fetch: typeof fetch | undefined;
  xhrOpen: typeof XMLHttpRequest.prototype.open | undefined;
  hadXhr: boolean;
  webSocket: typeof WebSocket | undefined;
  sendBeacon: typeof navigator.sendBeacon | undefined;
  hadBeacon: boolean;
}

const attempts: NetworkAttempt[] = [];
let state: GuardState | undefined;

export function networkAttempts(): readonly NetworkAttempt[] {
  return attempts;
}

export function clearNetworkAttempts(): void {
  attempts.length = 0;
}

function targetOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function installNetworkGuard(options: NetworkGuardOptions = {}): void {
  if (state) return;
  const allow = options.allow ?? (() => false);
  const trace = options.trace;

  const block = (api: NetworkApi, target: string): never => {
    attempts.push({ api, target });
    trace?.event('net.blocked', { api, target }, 'error');
    throw new Error(`Toolpa trace blocked network ${api} to ${target}`);
  };

  const originalFetch = globalThis.fetch?.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = targetOf(input);
    if (!allow(target)) block('fetch', target);
    if (!originalFetch) block('fetch', target);
    return originalFetch(input, init);
  }) as typeof fetch;

  const hadXhr = typeof globalThis.XMLHttpRequest === 'function';
  const originalOpen = hadXhr ? globalThis.XMLHttpRequest.prototype.open : undefined;
  if (hadXhr && originalOpen) {
    globalThis.XMLHttpRequest.prototype.open = function open(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      const target = String(url);
      if (!allow(target)) block('xhr', target);
      return originalOpen.call(this, method, url, async ?? true, username, password);
    };
  } else {
    class BlockedXMLHttpRequest {
      open(method: string, url: string | URL): void {
        block('xhr', `${method} ${String(url)}`);
      }
      send(): void {
        block('xhr', 'send');
      }
    }
    globalThis.XMLHttpRequest = BlockedXMLHttpRequest as unknown as typeof XMLHttpRequest;
  }

  const OriginalWebSocket = globalThis.WebSocket;
  function GuardedWebSocket(this: WebSocket, url: string | URL, protocols?: string | string[]) {
    const target = String(url);
    if (!allow(target)) block('websocket', target);
    if (!OriginalWebSocket) block('websocket', target);
    return new OriginalWebSocket(url, protocols);
  }
  GuardedWebSocket.prototype = OriginalWebSocket?.prototype ?? Object.prototype;
  globalThis.WebSocket = GuardedWebSocket as unknown as typeof WebSocket;

  let originalBeacon: typeof navigator.sendBeacon | undefined;
  let hadBeacon = false;
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    hadBeacon = true;
    originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      const target = String(url);
      if (!allow(target)) block('beacon', target);
      return originalBeacon!(url, data);
    };
  }

  state = {
    allow,
    trace,
    fetch: originalFetch as typeof fetch | undefined,
    xhrOpen: originalOpen,
    hadXhr,
    webSocket: OriginalWebSocket,
    sendBeacon: originalBeacon,
    hadBeacon,
  };
}

export function uninstallNetworkGuard(): void {
  if (!state) return;
  if (state.fetch) globalThis.fetch = state.fetch;
  if (state.hadXhr && state.xhrOpen) {
    globalThis.XMLHttpRequest.prototype.open = state.xhrOpen;
  }
  if (state.webSocket) globalThis.WebSocket = state.webSocket;
  if (state.hadBeacon && state.sendBeacon) navigator.sendBeacon = state.sendBeacon;
  state = undefined;
}

export function isNetworkGuardInstalled(): boolean {
  return state !== undefined;
}
