"use client";

import { useEffect, useMemo, useState } from "react";

import {
  subscribePatternPlaybackTrace,
} from "@/lib/audio/playback-agency";
import type { PatternStepTraceEvent } from "@/lib/audio/pattern";
import { cn } from "@/lib/utils";

type PatternLiveTraceProps = {
  patternId: string;
  maxEvents?: number;
};

export function PatternLiveTrace({
  patternId,
  maxEvents = 8,
}: PatternLiveTraceProps) {
  const [events, setEvents] = useState<PatternStepTraceEvent[]>([]);

  useEffect(() => {
    return subscribePatternPlaybackTrace((event) => {
      if (event.patternId !== patternId) {
        return;
      }

      setEvents((current) => [event, ...current].slice(0, maxEvents));
    });
  }, [maxEvents, patternId]);

  const visibleEvents = useMemo(
    () => events.filter((event) => event.patternId === patternId),
    [events, patternId],
  );
  const stats = useMemo(() => {
    const fired = visibleEvents.filter((event) => event.fired).length;
    return { fired, skipped: visibleEvents.length - fired };
  }, [visibleEvents]);

  return (
    <div className="min-w-64 border border-zinc-800 bg-zinc-950/70 p-2 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        <span>live agency</span>
        <span className="text-zinc-600">
          {stats.fired} fired / {stats.skipped} skipped
        </span>
      </div>
      <div className="grid max-h-24 gap-1 overflow-hidden" aria-live="polite">
        {visibleEvents.length > 0 ? (
          visibleEvents.map((event, index) => (
            <div
              key={`${event.trackId}:${event.stepIndex}:${event.reason}:${index}`}
              className="grid grid-cols-[52px_1fr_68px] items-center gap-2"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  event.fired ? "bg-zinc-100" : "bg-zinc-700",
                )}
                aria-hidden="true"
              />
              <span className="truncate text-zinc-400">
                {event.trackName} / {event.stepInTrack + 1}
              </span>
              <span
                className={cn(
                  "text-right text-[10px]",
                  event.fired ? "text-zinc-200" : "text-zinc-600",
                )}
              >
                {formatReason(event.reason)}
              </span>
            </div>
          ))
        ) : (
          <div className="text-zinc-700">waiting for playback</div>
        )}
      </div>
    </div>
  );
}

function formatReason(reason: PatternStepTraceEvent["reason"]) {
  return reason.replace("skip-", "");
}
