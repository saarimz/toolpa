import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import { SynthSceneSchema, type SynthScene } from "@/app/tools/evolving-fm-synth/lib/schema";
import { renderSynthSceneToAudioBuffer } from "@/lib/audio/synth-wav-render";

export const defaultDocument = createDefaultSynthScene("a tool that takes a vocal like sound and stutters it with probabilistic repeats");

export async function renderOffline(
  document: SynthScene = defaultDocument,
  durationSec = 1,
): Promise<AudioBuffer> {
  return renderSynthSceneToAudioBuffer(SynthSceneSchema.parse(document), {
    durationSec,
    sampleRate: 44100,
  });
}

export const renderId = "vocal-like-sound:synth-scene";
