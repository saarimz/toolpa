"use client";

import { useMemo } from "react";

import {
  getPatternStepAgency,
  getPatternStepAgencyClassName,
  PatternStepAgencyBadge,
  usePatternStepAgency,
} from "@/components/pattern-step-agency";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getCellSlot,
  getTrackId,
  type SpliceLabSource,
  type SpliceSource,
  type SpliceSourceKey,
} from "@/app/tools/splice-lab/lib/pattern";
import { useSpliceWaveforms } from "@/app/tools/splice-lab/components/use-splice-waveforms";
import { useSpliceLabStore } from "@/app/tools/splice-lab/store";

const sourceCellClasses: Record<SpliceSourceKey, string> = {
  A: "border-zinc-50/70 bg-zinc-50/20 text-zinc-50 shadow-[0_0_18px_rgba(245,245,245,0.22)]",
  B: "border-zinc-100/65 bg-zinc-100/15 text-zinc-50 shadow-[0_0_18px_rgba(244,244,245,0.18)]",
  C: "border-zinc-200/60 bg-zinc-200/15 text-zinc-100 shadow-[0_0_18px_rgba(228,228,231,0.16)]",
  D: "border-zinc-300/55 bg-zinc-300/15 text-zinc-100 shadow-[0_0_18px_rgba(212,212,216,0.14)]",
  E: "border-zinc-400/50 bg-zinc-400/10 text-zinc-100 shadow-[0_0_18px_rgba(161,161,170,0.14)]",
  F: "border-neutral-50/65 bg-neutral-50/15 text-neutral-50 shadow-[0_0_18px_rgba(245,245,245,0.16)]",
  G: "border-neutral-100/60 bg-neutral-100/15 text-neutral-50 shadow-[0_0_18px_rgba(245,245,245,0.14)]",
  H: "border-neutral-200/55 bg-neutral-200/10 text-neutral-100 shadow-[0_0_18px_rgba(229,229,229,0.14)]",
  I: "border-neutral-300/50 bg-neutral-300/10 text-neutral-100 shadow-[0_0_18px_rgba(212,212,212,0.12)]",
  J: "border-neutral-400/45 bg-neutral-400/10 text-neutral-100 shadow-[0_0_18px_rgba(163,163,163,0.12)]",
};

const sourceBarClasses: Record<SpliceSourceKey, string> = {
  A: "bg-zinc-50",
  B: "bg-zinc-100",
  C: "bg-zinc-200",
  D: "bg-zinc-300",
  E: "bg-zinc-400",
  F: "bg-neutral-50",
  G: "bg-neutral-100",
  H: "bg-neutral-200",
  I: "bg-neutral-300",
  J: "bg-neutral-400",
};

export function SpliceGrid() {
  const cells = useSpliceLabStore((state) => state.cells);
  const sources = useSpliceLabStore((state) => state.sources);
  const sliceCount = useSpliceLabStore((state) => state.sliceCount);
  const currentStepIndex = useSpliceLabStore((state) => state.currentStepIndex);
  const selectedStep = useSpliceLabStore((state) => state.selectedStep);
  const cycleCellSource = useSpliceLabStore((state) => state.cycleCellSource);
  const setCellSource = useSpliceLabStore((state) => state.setCellSource);
  const setSelectedStep = useSpliceLabStore((state) => state.setSelectedStep);
  const updateCell = useSpliceLabStore((state) => state.updateCell);
  const updateCellSlot = useSpliceLabStore((state) => state.updateCellSlot);
  const waveforms = useSpliceWaveforms(sources, sliceCount);
  const agencyEvents = usePatternStepAgency("splice-lab-pattern");
  const selected = useMemo(
    () => cells.find((cell) => cell.step === selectedStep) ?? null,
    [cells, selectedStep],
  );
  const sourceOptions = useMemo<SpliceSource[]>(
    () => ["rest", ...sources.map((source) => source.key)],
    [sources],
  );

  return (
    <section className="grid grid-cols-1 border-b border-zinc-800 lg:grid-cols-[1fr_280px]">
      <div className="overflow-x-auto p-4">
        <div className="min-w-[720px]">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
          >
            {cells.map((cell) => {
              const current =
                currentStepIndex !== null && currentStepIndex % cells.length === cell.step;
              const source = resolveCellSource(cell.source, sources);
              const slot = source ? getCellSlot(cell, source.key, sliceCount) : null;
              const bars =
                source && slot !== null
                  ? waveforms.get(source.key)?.sliceBars[slot]
                  : null;
              const agencyEvent = source
                ? getPatternStepAgency(agencyEvents, {
                    patternId: "splice-lab-pattern",
                    slot: slot ?? undefined,
                    stepIndex: cell.step,
                    trackId: getTrackId(source.key),
                  })
                : undefined;
              return (
                <button
                  key={cell.step}
                  type="button"
                  title={`splice step ${cell.step + 1}`}
                  onClick={() => cycleCellSource(cell.step)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setSelectedStep(cell.step);
                  }}
                  className={cn(
                    "relative h-24 overflow-hidden border p-1.5 text-xs transition hover:border-zinc-400",
                    source && sourceCellClasses[source.key],
                    cell.source === "rest" &&
                      "border-zinc-800 bg-zinc-950 text-zinc-700 hover:bg-zinc-900",
                    current &&
                      "z-10 outline outline-2 outline-white shadow-[0_0_28px_rgba(255,255,255,0.35)]",
                    selectedStep === cell.step && "outline outline-1 outline-zinc-100",
                    getPatternStepAgencyClassName(agencyEvent),
                  )}
                >
                  <PatternStepAgencyBadge event={agencyEvent} />
                  <span className="flex items-center justify-between">
                    <span className="text-sm">{source ? source.key : "-"}</span>
                    <span className="text-[10px] opacity-70">{cell.step + 1}</span>
                  </span>
                  <WaveformBars bars={bars} sourceKey={source?.key ?? null} />
                  <span className="mt-1 block truncate text-[10px] opacity-70">
                    {source && slot !== null ? `slice ${slot + 1}` : "rest"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => cells.forEach((cell) => setCellSource(cell.step, "rest"))}>
              clear
            </Button>
            <Button
              onClick={() =>
                cells.forEach((cell) =>
                  setCellSource(cell.step, getSourceAtStep(sources, cell.step)),
                )
              }
            >
              rotate sources
            </Button>
            <Button
              onClick={() =>
                cells.forEach((cell) =>
                  setCellSource(
                    cell.step,
                    cell.step % 8 === 4 || cell.step % 8 === 6
                      ? getSourceAtStep(sources, cell.step + 1)
                      : getSourceAtStep(sources, 0),
                  ),
                )
              }
            >
              answer
            </Button>
          </div>
        </div>
      </div>
      <aside className="border-t border-zinc-800 p-4 lg:border-l lg:border-t-0">
        <div className="mb-3 text-xs text-zinc-500">step map</div>
        {selected ? (
          <div className="space-y-4">
            <div className="text-sm text-zinc-200">step {selected.step + 1}</div>
            <label className="block text-xs text-zinc-500">
              source
              <select
                className="mt-2 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
                value={selected.source}
                onChange={(event) =>
                  setCellSource(selected.step, event.target.value as SpliceSource)
                }
              >
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <div className="max-h-64 space-y-3 overflow-auto pr-1">
              {sources.map((source) => (
                <Slider
                  key={source.key}
                  label={`slot ${source.key}`}
                  value={getCellSlot(selected, source.key, sliceCount)}
                  min={0}
                  max={sliceCount - 1}
                  step={1}
                  precision={0}
                  onChange={(value) => updateCellSlot(selected.step, source.key, value)}
                />
              ))}
            </div>
            <Slider
              label="pitch"
              value={selected.pitchSemitones}
              min={-24}
              max={24}
              step={1}
              precision={0}
              onChange={(value) => updateCell(selected.step, { pitchSemitones: value })}
            />
            <Slider
              label="probability"
              value={selected.probability}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => updateCell(selected.step, { probability: value })}
            />
            <Slider
              label="decay"
              value={selected.decay ?? 0.75}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => updateCell(selected.step, { decay: value })}
            />
            <label className="inline-flex items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={selected.reverse}
                onChange={(event) =>
                  updateCell(selected.step, { reverse: event.target.checked })
                }
                className="accent-zinc-200"
              />
              reverse
            </label>
          </div>
        ) : (
          <p className="text-xs leading-5 text-zinc-600">
            right-click a step to map source, source slice, pitch, probability, and decay.
          </p>
        )}
      </aside>
    </section>
  );
}

function WaveformBars({
  bars,
  sourceKey,
}: {
  bars: number[] | null | undefined;
  sourceKey: SpliceSourceKey | null;
}) {
  if (!bars || !sourceKey) {
    return (
      <span className="mt-2 flex h-9 items-end gap-px opacity-35" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} className="h-px flex-1 bg-zinc-700" />
        ))}
      </span>
    );
  }

  return (
    <span className="mt-2 flex h-9 items-end gap-px" aria-hidden="true">
      {bars.map((peak, index) => (
        <span
          key={index}
          className={cn("flex-1 rounded-t-sm opacity-90", sourceBarClasses[sourceKey])}
          style={{ height: `${Math.max(10, Math.round(peak * 100))}%` }}
        />
      ))}
    </span>
  );
}

function resolveCellSource(
  source: SpliceSource,
  sources: SpliceLabSource[],
): SpliceLabSource | null {
  if (source === "rest") {
    return null;
  }

  return sources.find((candidate) => candidate.key === source) ?? null;
}

function getSourceAtStep(sources: SpliceLabSource[], step: number): SpliceSource {
  return sources[step % sources.length]?.key ?? "rest";
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  precision = 2,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <input
        className="mt-2 w-full accent-zinc-200"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="text-zinc-300">{value.toFixed(precision)}</span>
    </label>
  );
}
