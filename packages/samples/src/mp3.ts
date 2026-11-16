import { MPEGDecoder } from 'mpg123-decoder';
import { SampleError, type WavPcm } from './wav.ts';

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function decodeMp3(bytes: Uint8Array): Promise<WavPcm> {
  return enqueue(async () => {
    const decoder = new MPEGDecoder();
    await decoder.ready;
    try {
      const decoded = decoder.decode(bytes);
      if (!decoded.samplesDecoded || decoded.channelData.length === 0) {
        const detail = decoded.errors.map((error) => error.message).join('; ');
        throw new SampleError('mp3', detail || 'MP3 decoder produced no samples');
      }
      const channels = decoded.channelData.length;
      const frames = decoded.samplesDecoded;
      const pcm = new Float32Array(frames);
      for (let frame = 0; frame < frames; frame += 1) {
        let sum = 0;
        for (let channel = 0; channel < channels; channel += 1) {
          sum += decoded.channelData[channel]?.[frame] ?? 0;
        }
        pcm[frame] = sum / channels;
      }
      return { sampleRate: decoded.sampleRate, channels, frames, pcm };
    } finally {
      decoder.free();
    }
  });
}
