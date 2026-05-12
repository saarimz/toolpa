"use client";

import { useMemo } from "react";

import { useGridSamplerStore } from "@/app/tools/grid-sampler/store";

export function GridStepGrid() {
  const cells = useGridSamplerStore((state) => state.cells);
  const selectedCell = useGridSamplerStore((state) => state.selectedCell);
  const updateCell = useGridSamplerStore((state) => state.updateCell);
  const selected = useMemo(
    () => cells.find((cell) => cell.slot === selectedCell) ?? null,
    [cells, selectedCell],
  );

  return (
    <section className="grid grid-cols-1 border-b border-zinc-800 lg:grid-cols-[1fr_280px]">
      <div className="p-4 text-xs leading-5 text-zinc-600">
        right-click a grid cell to edit probability, velocity, and microShift. Drag across the
        grid to paint active cells. Traversal determines how this 2D state becomes a Pattern.
      </div>
      <aside className="border-t border-zinc-800 p-4 lg:border-l lg:border-t-0">
        <div className="mb-3 text-xs text-zinc-500">cell editor</div>
        {selected ? (
          <div className="space-y-4">
            <div className="text-sm text-zinc-200">cell {selected.slot + 1}</div>
            <Slider
              label="velocity"
              value={selected.velocity}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => updateCell(selected.slot, { velocity: value })}
            />
            <Slider
              label="probability"
              value={selected.probability}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => updateCell(selected.slot, { probability: value })}
            />
            <Slider
              label="microShift"
              value={selected.microShift}
              min={-0.5}
              max={0.5}
              step={0.01}
              onChange={(value) => updateCell(selected.slot, { microShift: value })}
            />
          </div>
        ) : (
          <p className="text-xs leading-5 text-zinc-600">no cell pinned</p>
        )}
      </aside>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
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
      <span className="text-zinc-300">{value.toFixed(2)}</span>
    </label>
  );
}
