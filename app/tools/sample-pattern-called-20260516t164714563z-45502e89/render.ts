import { renderPatternToAudioBuffer } from "@/lib/audio/wav-render";
import { createPattern, createStep, createTrack, PatternSchema, type Pattern } from "@/lib/pattern/schema";

const GATE_SAMPLE_ID = "sample-pattern-called-20260516t164714563z-45502e89-audio-gate-sample";

export const defaultDocument = createPattern({
  id: "sample-pattern-called-20260516t164714563z-45502e89-default",
  name: "sample-pattern-called-20260516t164714563z-45502e89 default pattern",
  bpm: 120,
  bars: 1,
  stepsPerBar: 16,
  tracks: [
    createTrack({
      id: "main",
      name: "main",
      sampleId: GATE_SAMPLE_ID,
      slot: 0,
      steps: Array.from({ length: 16 }, (_, index) =>
        createStep({ active: index % 4 === 0, slot: 0, velocity: 0.75 }),
      ),
    }),
  ],
});

export async function renderOffline(
  document: Pattern = defaultDocument,
  durationSec = 1,
): Promise<AudioBuffer> {
  return renderPatternToAudioBuffer(PatternSchema.parse(document), {
    durationSec,
    sampleRate: 44100,
    sliceCount: 1,
  });
}
