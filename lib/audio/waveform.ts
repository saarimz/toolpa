export type WaveformAudioBuffer = Pick<AudioBuffer, "length" | "getChannelData"> &
  Partial<Pick<AudioBuffer, "numberOfChannels">>;

export function computeWaveformBars(
  audioBuffer: WaveformAudioBuffer,
  barCount: number,
  startRatio = 0,
  endRatio = 1,
) {
  const normalizedBarCount = Math.max(1, Math.floor(barCount));
  const startSample = Math.max(0, Math.floor(audioBuffer.length * startRatio));
  const endSample = Math.max(
    startSample + 1,
    Math.min(audioBuffer.length, Math.ceil(audioBuffer.length * endRatio)),
  );
  const samplesPerBar = Math.max(1, Math.ceil((endSample - startSample) / normalizedBarCount));
  const channelCount = Math.max(1, audioBuffer.numberOfChannels ?? 1);
  const channels = Array.from({ length: channelCount }, (_, channelIndex) =>
    audioBuffer.getChannelData(channelIndex),
  );

  return Array.from({ length: normalizedBarCount }, (_, bar) => {
    const start = startSample + bar * samplesPerBar;
    const end = Math.min(endSample, start + samplesPerBar);
    let peak = 0;

    for (const channel of channels) {
      for (let index = start; index < end; index += 1) {
        peak = Math.max(peak, Math.abs(channel[index] ?? 0));
      }
    }

    return Math.min(1, peak);
  });
}

export function computeSliceWaveformBars(
  audioBuffer: WaveformAudioBuffer,
  sliceCount: number,
  barCount = 12,
) {
  const normalizedSliceCount = Math.max(1, Math.floor(sliceCount));
  return Array.from({ length: normalizedSliceCount }, (_, slot) =>
    computeWaveformBars(
      audioBuffer,
      barCount,
      slot / normalizedSliceCount,
      (slot + 1) / normalizedSliceCount,
    ),
  );
}
