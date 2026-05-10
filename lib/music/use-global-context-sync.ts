"use client";

import { useEffect } from "react";

import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

export function useGlobalBpmSync(setBpm: (bpm: number) => void) {
  const context = useGlobalMusicContextStore((state) => state.context);
  const hydrate = useGlobalMusicContextStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setBpm(context.bpm);
  }, [context.bpm, setBpm]);
}

export function useGlobalSynthContextSync({
  setBpm,
  setKeyAndScale,
}: {
  setBpm: (bpm: number) => void;
  setKeyAndScale: (key: string, scale?: string) => void;
}) {
  const context = useGlobalMusicContextStore((state) => state.context);
  const hydrate = useGlobalMusicContextStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setBpm(context.bpm);
  }, [context.bpm, setBpm]);

  useEffect(() => {
    setKeyAndScale(context.key.tonic, context.key.scaleId);
  }, [context.key.scaleId, context.key.tonic, setKeyAndScale]);
}
