"use client";

import { create } from "zustand";

import {
  DEFAULT_GLOBAL_MUSIC_CONTEXT,
  GlobalMusicContextSchema,
  type GlobalMusicContext,
  type Tonic,
} from "@/lib/music/context";
import { resolveScaleKey, type ScaleKey } from "@/lib/music/scale-catalog";

const STORAGE_KEY = "ai-daw-tools:global-music-context";
let storageListenerAttached = false;

type GlobalMusicContextStore = {
  context: GlobalMusicContext;
  hydrated: boolean;
  hydrate: () => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setKey: (key: { tonic?: Tonic; scaleId?: string; referenceFrequency?: number }) => void;
  setScaleKey: (scaleKey: ScaleKey) => void;
};

export const useGlobalMusicContextStore = create<GlobalMusicContextStore>((set, get) => ({
  context: DEFAULT_GLOBAL_MUSIC_CONTEXT,
  hydrated: false,
  hydrate() {
    if (get().hydrated || typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed = stored
      ? safelyParseStoredContext(stored)
      : { success: false as const };
    const context = parsed.success ? parsed.data : DEFAULT_GLOBAL_MUSIC_CONTEXT;

    ensureStorageListener(set);
    set({ context, hydrated: true });
    window.dispatchEvent(new CustomEvent("global-music-context-change", { detail: context }));
  },
  setBpm(bpm) {
    setAndPersist(set, { ...get().context, bpm });
  },
  setSwing(swing) {
    setAndPersist(set, { ...get().context, swing });
  },
  setKey(key) {
    const current = get().context;
    const scaleKey = resolveScaleKey({
      tonic: key.tonic ?? current.key.tonic,
      scaleId: key.scaleId ?? current.key.scaleId,
    });

    setAndPersist(set, {
      ...current,
      key: {
        tonic: scaleKey.tonic,
        scaleId: scaleKey.scale.id,
        referenceFrequency: key.referenceFrequency ?? current.key.referenceFrequency,
      },
    });
  },
  setScaleKey(scaleKey) {
    const current = get().context;
    setAndPersist(set, {
      ...current,
      key: {
        ...current.key,
        tonic: scaleKey.tonic,
        scaleId: scaleKey.scale.id,
      },
    });
  },
}));

function setAndPersist(
  set: (partial: Partial<GlobalMusicContextStore>) => void,
  candidate: GlobalMusicContext,
) {
  const context = GlobalMusicContextSchema.parse(candidate);
  if (typeof window !== "undefined") {
    ensureStorageListener(set);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    window.dispatchEvent(new CustomEvent("global-music-context-change", { detail: context }));
  }
  set({ context, hydrated: true });
}

function ensureStorageListener(set: (partial: Partial<GlobalMusicContextStore>) => void) {
  if (storageListenerAttached || typeof window === "undefined") {
    return;
  }

  storageListenerAttached = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) {
      return;
    }

    const parsed = safelyParseStoredContext(event.newValue);
    if (!parsed.success) {
      return;
    }

    set({ context: parsed.data, hydrated: true });
    window.dispatchEvent(
      new CustomEvent("global-music-context-change", { detail: parsed.data }),
    );
  });
}

function safelyParseStoredContext(stored: string) {
  try {
    return GlobalMusicContextSchema.safeParse(JSON.parse(stored));
  } catch {
    return { success: false as const };
  }
}
