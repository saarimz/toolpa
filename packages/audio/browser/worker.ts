import { renderChain } from '../src/render.ts';

interface RenderRequest {
  id: number;
  chain: unknown;
  durationSeconds: number;
}

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, chain, durationSeconds } = event.data;
  void renderChain({ chain, durationSeconds })
    .then((rendered) => {
      self.postMessage({
        id,
        hash: rendered.hash,
        wavSha256: rendered.wavSha256,
        frames: rendered.frames,
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      self.postMessage({ id, error: `${code}: ${message}` });
    });
};
