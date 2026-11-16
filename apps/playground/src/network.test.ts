import { describe, expect, it } from 'vitest';
import { allowPlaygroundTarget } from './network.ts';

const page = 'http://127.0.0.1:47291/';

describe('playground network guard', () => {
  it('allows only /api/agent on its own origin', () => {
    expect(allowPlaygroundTarget('blob:http://127.0.0.1:47291/worklet', page)).toBe(true);
    expect(allowPlaygroundTarget('http://127.0.0.1:47291/api/agent', page)).toBe(true);
    expect(allowPlaygroundTarget('http://127.0.0.1:47291/@vite/client', page)).toBe(true);
    expect(allowPlaygroundTarget('http://127.0.0.1:47291/api/other', page)).toBe(false);
    expect(allowPlaygroundTarget('https://gateway.ai.cloudflare.com/v1/acct/gw/compat/chat/completions', page)).toBe(false);
    expect(allowPlaygroundTarget('https://ai-gateway.vercel.sh/v1/chat/completions', page)).toBe(false);
  });
});