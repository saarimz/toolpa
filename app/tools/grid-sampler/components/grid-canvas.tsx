"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { SamplePicker } from "@/components/sample-picker";
import { cn } from "@/lib/utils";
import { auditionIntelligenceSamplerSlice } from "@/app/tools/intelligence-sampler/lib/play";
import {
  getGridDimensions,
  getTraversalCellAtStep,
  getTraversalPositions,
  GridSliceCounts,
  TraversalModes,
  type GridSliceCount,
} from "@/app/tools/grid-sampler/lib/traversal";
import { useGridSamplerStore } from "@/app/tools/grid-sampler/store";

export function GridCanvas() {
  const [isPainting, setIsPainting] = useState(false);
  const [paintActive, setPaintActive] = useState(true);
  const auditionTimerRef = useRef<number | null>(null);
  const sourceSampleId = useGridSamplerStore((state) => state.sourceSampleId);
  const sourceSampleName = useGridSamplerStore((state) => state.sourceSampleName);
  const sliceCount = useGridSamplerStore((state) => state.sliceCount);
  const traversal = useGridSamplerStore((state) => state.traversal);
  const seed = useGridSamplerStore((state) => state.seed);
  const cells = useGridSamplerStore((state) => state.cells);
  const currentStepIndex = useGridSamplerStore((state) => state.currentStepIndex);
  const selectedCell = useGridSamplerStore((state) => state.selectedCell);
  const setSample = useGridSamplerStore((state) => state.setSample);
  const setSliceCount = useGridSamplerStore((state) => state.setSliceCount);
  const setTraversal = useGridSamplerStore((state) => state.setTraversal);
  const toggleCell = useGridSamplerStore((state) => state.toggleCell);
  const paintCell = useGridSamplerStore((state) => state.paintCell);
  const setSelectedCell = useGridSamplerStore((state) => state.setSelectedCell);
  const dimensions = getGridDimensions(sliceCount);
  const currentCellSlot =
    currentStepIndex === null
      ? null
      : getTraversalCellAtStep(sliceCount, traversal, currentStepIndex, seed);
  const traversalPositions = useMemo(
    () => getTraversalPositions(sliceCount, traversal, seed),
    [seed, sliceCount, traversal],
  );
  const activeSlots = useMemo(
    () => new Set(cells.filter((cell) => cell.active).map((cell) => cell.slot)),
    [cells],
  );

  useEffect(
    () => () => {
      if (auditionTimerRef.current) {
        window.clearTimeout(auditionTimerRef.current);
      }
    },
    [],
  );

  return (
    <section className="border-b border-zinc-800 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SamplePicker
          id="grid-sample"
          value={sourceSampleId}
          label="source"
          roles={["break", "loop", "oneshot", "melodic", "pad", "fx"]}
          onSelect={(sample) => {
            setSample(sample.id, sample.name, sample.role);
          }}
        />
        <label className="text-xs text-zinc-500" htmlFor="grid-dim">
          dim
        </label>
        <select
          id="grid-dim"
          value={sliceCount}
          onChange={(event) =>
            setSliceCount(Number(event.target.value) as GridSliceCount)
          }
          className="h-9 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
        >
          {GridSliceCounts.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        <label className="text-xs text-zinc-500" htmlFor="grid-traversal">
          traversal
        </label>
        <select
          id="grid-traversal"
          value={traversal}
          onChange={(event) => setTraversal(event.target.value as typeof traversal)}
          className="h-9 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
        >
          {TraversalModes.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-600">{sourceSampleName}</span>
      </div>
      <div
        className="grid select-none gap-1"
        style={{ gridTemplateColumns: `repeat(${dimensions.cols}, minmax(0, 1fr))` }}
        onPointerLeave={() => setIsPainting(false)}
        onPointerUp={() => setIsPainting(false)}
      >
        {cells.map((cell) => {
          const current = currentCellSlot === cell.slot;
          const ghosted = !cell.active && activeSlots.has(cell.slot);
          const bars = getCellWaveBars(cell.slot);
          const traversalPosition = (traversalPositions.get(cell.slot) ?? cell.slot) + 1;
          const nextActive = !cell.active;

          return (
            <button
              key={cell.slot}
              type="button"
              aria-current={current ? "step" : undefined}
              aria-label={`slice ${cell.slot + 1}, play ${traversalPosition}, ${
                cell.active ? "active" : "inactive"
              }`}
              title={`slice ${cell.slot + 1} / play ${traversalPosition}`}
              onPointerDown={() => {
                setIsPainting(true);
                setPaintActive(nextActive);
                toggleCell(cell.slot);
              }}
              onPointerEnter={() => {
                if (isPainting) {
                  paintCell(cell.slot, paintActive);
                }
                if (auditionTimerRef.current) {
                  window.clearTimeout(auditionTimerRef.current);
                }
                auditionTimerRef.current = window.setTimeout(() => {
                  void auditionIntelligenceSamplerSlice(sourceSampleId, cell.slot, { sliceCount });
                }, 320);
              }}
              onPointerLeave={() => {
                if (auditionTimerRef.current) {
                  window.clearTimeout(auditionTimerRef.current);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setSelectedCell(cell.slot);
              }}
              className={cn(
                "relative h-10 overflow-hidden border text-[10px] transition duration-150",
                cell.active
                  ? "border-cyan-300/50 bg-cyan-300 text-zinc-950"
                  : "border-zinc-800 bg-zinc-950 text-zinc-700 hover:bg-zinc-900",
                current &&
                  "z-10 scale-[1.04] border-fuchsia-100 bg-fuchsia-200/20 text-fuchsia-50 shadow-[0_0_0_1px_rgba(244,114,182,0.95),0_0_18px_rgba(217,70,239,0.85),0_0_40px_rgba(34,211,238,0.35)]",
                selectedCell === cell.slot &&
                  !current &&
                  "outline outline-1 outline-cyan-100",
                ghosted && "border-dashed",
              )}
            >
              {current ? (
                <>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,114,182,0.46),rgba(34,211,238,0.16)_46%,transparent_76%)]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 border border-fuchsia-100/90 shadow-[inset_0_0_12px_rgba(244,114,182,0.75)]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-1 top-1 size-1.5 animate-pulse rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.95),0_0_18px_rgba(34,211,238,0.85)]"
                  />
                </>
              ) : null}
              <span
                aria-hidden="true"
                className="absolute left-1 top-0.5 z-10 font-mono text-[9px] leading-none opacity-70"
              >
                {traversalPosition}
              </span>
              <span className="relative z-10 flex h-full items-end justify-center gap-px px-1 py-1">
                {bars.map((height, index) => (
                  <span
                    key={index}
                    className={cn(
                      "w-1 bg-current",
                      current ? "opacity-85" : "opacity-50",
                      cell.active ? "text-zinc-950" : "text-zinc-600",
                    )}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </span>
              <span className="sr-only">{cell.active ? cell.slot + 1 : "inactive"}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => cells.forEach((cell) => paintCell(cell.slot, true))}>
          fill
        </Button>
        <Button onClick={() => cells.forEach((cell) => paintCell(cell.slot, false))}>
          clear
        </Button>
      </div>
    </section>
  );
}

function getCellWaveBars(slot: number) {
  return Array.from({ length: 5 }, (_, index) => {
    const value = Math.sin((slot + 1) * (index + 2) * 1.7);
    return 18 + Math.round(Math.abs(value) * 70);
  });
}
