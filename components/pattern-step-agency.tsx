"use client";

import { useEffect, useRef, useState } from "react";

import { subscribePatternPlaybackTrace } from "@/lib/audio/playback-agency";
import type { PatternStepTraceEvent } from "@/lib/audio/pattern";
import { cn } from "@/lib/utils";

type PatternStepAgencySnapshot = PatternStepTraceEvent & {
  receivedAt: number;
};

type PatternStepAgencyMap = Record<string, PatternStepAgencySnapshot>;

export function usePatternStepAgency(
  patternId: string,
  {
    maxAgeMs = 900,
  }: {
    maxAgeMs?: number;
  } = {},
) {
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [events, setEvents] = useState<PatternStepAgencyMap>({});

  useEffect(() => {
    const timers = timersRef.current;
    const unsubscribe = subscribePatternPlaybackTrace((event) => {
      if (event.patternId !== patternId) {
        return;
      }

      const receivedAt = Date.now();
      const keys = getAgencyKeys(event);
      setEvents((current) => {
        const next = { ...current };
        for (const key of keys) {
          next[key] = { ...event, receivedAt };
        }
        return next;
      });

      for (const key of keys) {
        const existingTimer = timers.get(key);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
          setEvents((current) => {
            if (current[key]?.receivedAt !== receivedAt) {
              return current;
            }
            const next = { ...current };
            delete next[key];
            return next;
          });
          timers.delete(key);
        }, maxAgeMs);
        timers.set(key, timer);
      }
    });

    return () => {
      unsubscribe();
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [maxAgeMs, patternId]);

  return events;
}

export function getPatternStepAgency(
  events: PatternStepAgencyMap,
  {
    patternId,
    slot,
    stepIndex,
    trackId,
  }: {
    patternId: string;
    slot?: number | null;
    stepIndex: number;
    trackId: string;
  },
) {
  const event =
    events[getStepKey(trackId, stepIndex)] ??
    (typeof slot === "number" ? events[getSlotKey(trackId, slot)] : undefined);

  return event?.patternId === patternId ? event : undefined;
}

export function getPatternStepAgencyClassName(
  event: PatternStepTraceEvent | undefined,
) {
  if (!event) {
    return "";
  }

  if (event.fired) {
    return cn(
      "ring-1 ring-amber-200/90 shadow-[0_0_18px_rgba(251,191,36,0.32)]",
      Math.abs(event.microShift) > 0.001 && "translate-y-[-1px]",
    );
  }

  if (event.reason === "skip-prob") {
    return "opacity-55 ring-1 ring-amber-700/70";
  }

  if (event.reason === "skip-cond") {
    return "opacity-65 bg-[repeating-linear-gradient(45deg,rgba(251,191,36,0.16)_0_4px,transparent_4px_8px)]";
  }

  return "opacity-45 ring-1 ring-zinc-700/70";
}

export function PatternStepAgencyBadge({
  event,
}: {
  event: PatternStepTraceEvent | undefined;
}) {
  if (!event) {
    return null;
  }

  return (
    <span
      aria-label={`playback agency ${formatAgencyReason(event)}`}
      className={cn(
        "pointer-events-none absolute right-0.5 top-0.5 z-20 rounded-sm border px-1 py-0.5 text-[8px] uppercase leading-none",
        event.fired
          ? "border-amber-200/80 bg-amber-200 text-zinc-950"
          : "border-zinc-700 bg-zinc-950/90 text-zinc-400",
      )}
    >
      {formatAgencyReason(event)}
    </span>
  );
}

function getAgencyKeys(event: PatternStepTraceEvent) {
  return [
    getStepKey(event.trackId, event.stepInTrack),
    typeof event.slot === "number" ? getSlotKey(event.trackId, event.slot) : null,
  ].filter((key): key is string => Boolean(key));
}

function getStepKey(trackId: string, stepIndex: number) {
  return `${trackId}:step:${stepIndex}`;
}

function getSlotKey(trackId: string, slot: number) {
  return `${trackId}:slot:${slot}`;
}

function formatAgencyReason(event: PatternStepTraceEvent) {
  if (event.fired && Math.abs(event.microShift) > 0.001) {
    return "shift";
  }

  if (event.fired) {
    return "fire";
  }

  return event.reason.replace("skip-", "");
}
