"use client";

import { useEffect, useRef } from "react";

import {
  decodePatternFromHash,
  patternToUrl,
} from "@/lib/pattern/url-codec";
import type { Pattern } from "@/lib/pattern/schema";

const DEFAULT_DEBOUNCE_MS = 300;

export type UseUrlPatternStateOptions = {
  pattern: Pattern;
  setPattern: (next: Pattern) => void;
  isPlaying?: boolean;
  debounceMs?: number;
};

export function useUrlPatternState({
  pattern,
  setPattern,
  isPlaying = false,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseUrlPatternStateOptions): void {
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    if (typeof window === "undefined") {
      return;
    }
    const decoded = decodePatternFromHash(window.location.hash);
    if (decoded) {
      setPattern(decoded);
    }
  }, [setPattern]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    if (isPlaying) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }

    const timer = setTimeout(() => {
      const next = patternToUrl(new URL(window.location.href), pattern);
      window.history.replaceState(null, "", next);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [pattern, isPlaying, debounceMs]);
}
