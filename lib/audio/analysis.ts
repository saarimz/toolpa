import { guess } from "web-audio-beat-detector";

export type BpmGuess = {
  bpm: number;
  offset: number;
  tempo: number;
};

export type BpmDetector = (audioBuffer: AudioBuffer) => Promise<BpmGuess>;

export async function detectBpm(
  audioBuffer: AudioBuffer,
  detector: BpmDetector = guess as BpmDetector,
): Promise<BpmGuess> {
  const result = await detector(audioBuffer);
  return {
    bpm: result.bpm,
    offset: result.offset,
    tempo: result.tempo,
  };
}
