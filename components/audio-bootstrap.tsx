"use client";

import { useState } from "react";
import { Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AudioBootstrap() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enableAudio() {
    try {
      const Tone = await import("tone");
      await Tone.start();
      setReady(true);
      setError(null);
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Audio could not be enabled",
      );
    }
  }

  if (ready) {
    return null;
  }

  return (
    <div className="fixed right-3 top-3 z-50 max-w-[calc(100vw-1.5rem)] border border-zinc-800 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur">
      <Button className="h-9 px-3 text-xs" variant="solid" onClick={enableAudio}>
        <Volume2 className="size-4" />
        enable audio
      </Button>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
