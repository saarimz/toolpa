"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function IntelligenceSamplerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-2xl border border-red-400/40 bg-red-500/10 p-4">
        <div className="text-xs text-red-200">intelligence-sampler crashed</div>
        <h1 className="mt-2 text-lg">tool runtime error</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          The route recovered into an error boundary. Current browser audio and
          generation state may need to be restarted.
        </p>
        <pre className="mt-4 max-h-44 overflow-auto border border-red-400/20 bg-black p-3 text-xs text-red-100">
          {error.message}
          {error.digest ? `\n${error.digest}` : ""}
        </pre>
        <Button className="mt-4" variant="danger" onClick={reset}>
          <RotateCcw className="size-4" />
          retry tool
        </Button>
      </div>
    </main>
  );
}
