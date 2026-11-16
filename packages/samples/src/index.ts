export { SampleError, decodeWav } from './wav.ts';
export { decodeMp3 } from './mp3.ts';
export {
  MAX_SAMPLE_BYTES,
  assertSampleSize,
  decodeMp3Sample,
  decodeSample,
  decodeWavSample,
  identifyBytes,
  looksLikeMp3,
  looksLikeWav,
} from './decode.ts';
export type { DecodedSample } from './decode.ts';
export type { WavPcm } from './wav.ts';
