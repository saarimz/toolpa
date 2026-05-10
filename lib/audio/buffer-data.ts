export function getAudioBufferChannelData(audioBuffer: AudioBuffer) {
  if (
    typeof audioBuffer.getChannelData !== "function" ||
    !Number.isFinite(audioBuffer.sampleRate)
  ) {
    return null;
  }

  const channelCount = Math.max(1, audioBuffer.numberOfChannels || 1);
  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < channelCount; channel += 1) {
    channelData.push(audioBuffer.getChannelData(channel));
  }

  return {
    channelData,
    sampleRate: audioBuffer.sampleRate,
  };
}
