"use client";

import { Plus, X } from "lucide-react";

import { SamplePicker } from "@/components/sample-picker";
import { Button } from "@/components/ui/button";
import {
  SpliceSliceCounts,
  SpliceSourceKeys,
  type SpliceSliceCount,
} from "@/app/tools/splice-lab/lib/pattern";
import { useSpliceLabStore } from "@/app/tools/splice-lab/store";

const allRoles = ["break", "loop", "oneshot", "melodic", "pad", "fx"] as const;

export function SpliceSourcePanel() {
  const sources = useSpliceLabStore((state) => state.sources);
  const sliceCount = useSpliceLabStore((state) => state.sliceCount);
  const setSource = useSpliceLabStore((state) => state.setSource);
  const addSource = useSpliceLabStore((state) => state.addSource);
  const removeSource = useSpliceLabStore((state) => state.removeSource);
  const setSliceCount = useSpliceLabStore((state) => state.setSliceCount);
  const lastSourceKey = sources[sources.length - 1]?.key;

  return (
    <section className="border-b border-zinc-800 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase text-zinc-500">sources</div>
          <div className="mt-1 text-sm text-zinc-200">
            {sources.length} loaded sample{sources.length === 1 ? "" : "s"}
          </div>
        </div>
        <Button disabled={sources.length >= SpliceSourceKeys.length} onClick={addSource}>
          <Plus className="size-4" />
          add source
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sources.map((source) => (
          <div
            key={source.key}
            className="min-w-0 border border-zinc-800 bg-zinc-950 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs uppercase text-zinc-400">source {source.key}</span>
              <Button
                className="h-7 px-2"
                disabled={sources.length <= 2 || source.key !== lastSourceKey}
                title={
                  source.key === lastSourceKey
                    ? "remove newest source"
                    : "remove newer sources first"
                }
                onClick={() => removeSource(source.key)}
              >
                <X className="size-3.5" />
                remove
              </Button>
            </div>
            <SamplePicker
              id={`splice-source-${source.key.toLowerCase()}`}
              label={`sample ${source.key}`}
              value={source.sampleId}
              roles={allRoles}
              onSelect={(sample) =>
                setSource(source.key, sample.id, sample.name, sample.role)
              }
            />
            <div className="mt-2 truncate text-xs text-zinc-600">{source.name}</div>
            <div className="mt-1 text-[11px] uppercase text-zinc-700">{source.role}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-xs text-zinc-500" htmlFor="splice-slices">
          mapping
        </label>
        <select
          id="splice-slices"
          value={sliceCount}
          onChange={(event) =>
            setSliceCount(Number(event.target.value) as SpliceSliceCount)
          }
          className="h-9 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
        >
          {SpliceSliceCounts.map((count) => (
            <option key={count} value={count}>
              {count} slices
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-600">
          each step chooses one loaded source and one slice slot for that source
        </span>
      </div>
    </section>
  );
}
