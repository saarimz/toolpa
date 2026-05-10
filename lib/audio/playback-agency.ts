import type { PatternStepTraceEvent } from "@/lib/audio/pattern";

export const PATTERN_PLAYBACK_TRACE_EVENT = "ai-daw-tools:pattern-playback-trace";

export function publishPatternPlaybackTrace(event: PatternStepTraceEvent) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<PatternStepTraceEvent>(PATTERN_PLAYBACK_TRACE_EVENT, {
      detail: event,
    }),
  );
}

export function subscribePatternPlaybackTrace(
  listener: (event: PatternStepTraceEvent) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    listener((event as CustomEvent<PatternStepTraceEvent>).detail);
  };
  window.addEventListener(PATTERN_PLAYBACK_TRACE_EVENT, handler);

  return () => window.removeEventListener(PATTERN_PLAYBACK_TRACE_EVENT, handler);
}
