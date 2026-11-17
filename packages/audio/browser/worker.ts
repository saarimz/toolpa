import { renderChain } from '../src/render.ts';

interface RenderRequest {
  id: number;
  chain: unknown;
  durationSeconds: number;
  format?: 'pcm16' | 'pcm24' | 'float32';
}

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, chain, durationSeconds, format } = event.data;
  void renderChain({ chain, durationSeconds, format })
    .then((rendered) => {
      const wav = new Uint8Array(rendered.wav.byteLength);
      wav.set(rendered.wav);
      self.postMessage({
        id,
        hash: rendered.hash,
        wavSha256: rendered.wavSha256,
        frames: rendered.frames,
        format: rendered.format,
        wav,
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      self.postMessage({ id, error: `${code}: ${message}` });
    });
};
