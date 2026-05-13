import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import { SynthSceneSchema, type SynthScene } from "@/app/tools/evolving-fm-synth/lib/schema";
import { renderSynthSceneToAudioBuffer } from "@/lib/audio/synth-wav-render";

export const defaultDocument = createDefaultSynthScene("a sine wave synth with a lot of chorus");

export async function renderOffline(
  document: SynthScene = defaultDocument,
  durationSec = 1,
): Promise<AudioBuffer> {
  return renderSynthSceneToAudioBuffer(SynthSceneSchema.parse(document), {
    durationSec,
    sampleRate: 44100,
  });
}

export const renderId = "sine-wave-synth:synth-scene";
