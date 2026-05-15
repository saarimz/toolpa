"use client";

import { AudioVisualizerTool } from "@/components/audio-visualizer-tool";

const DEFAULT_PROMPT =
  "fullscreen spectral bloom with neon lattice trails, bass pulses, waveform ribbons, and subtle micro fluctuations";

export function AudioVisualizerClient() {
  return (
    <AudioVisualizerTool
      defaultPrompt={DEFAULT_PROMPT}
      description="Prompt-shaped fullscreen visualizer for live generated, microphone, or recorded audio."
      toolName="Audio Visualizer"
      toolSlug="audio-visualizer"
    />
  );
}
