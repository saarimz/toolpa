"use client";

import { useMemo, type KeyboardEvent } from "react";

import {
  summarizeTrackGeometry,
  type GeometryTrackSummary,
} from "@/app/tools/drum-machine/lib/geometry";
import { useDrumMachineStore } from "@/app/tools/drum-machine/store";
import type { Track } from "@/lib/pattern/schema";
import { cn } from "@/lib/utils";

const ringSize = 224;
const center = ringSize / 2;
const radius = 82;

export function CircularDrumGeometry() {
  const pattern = useDrumMachineStore((state) => state.pattern);
  const geometryPlan = useDrumMachineStore((state) => state.geometryPlan);
  const toggleStep = useDrumMachineStore((state) => state.toggleStep);
  const setTrackEuclidean = useDrumMachineStore((state) => state.setTrackEuclidean);
  const summaries = useMemo(
    () => new Map(pattern.tracks.map((track) => [track.id, summarizeTrackGeometry(track)])),
    [pattern.tracks],
  );

  return (
    <section className="border-b border-zinc-800 p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm text-zinc-200">circular rhythm geometry</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            {geometryPlan
              ? geometryPlan.rationale
              : "rings show cyclic onsets, necklace rotation, interval vectors, oddity, and off-beatness"}
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          {pattern.tracks.length} rings / {pattern.stepsPerBar} pulse grid
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {pattern.tracks.map((track) => {
          const summary = summaries.get(track.id) ?? summarizeTrackGeometry(track);
          return (
            <RhythmRing
              key={track.id}
              summary={summary}
              track={track}
              onRegenerate={(hits, rotation) => setTrackEuclidean(track.id, hits, rotation)}
              onToggleStep={(stepIndex) => toggleStep(track.id, stepIndex)}
            />
          );
        })}
      </div>
    </section>
  );
}

function RhythmRing({
  onRegenerate,
  onToggleStep,
  summary,
  track,
}: {
  onRegenerate: (hits: number, rotation: number) => void;
  onToggleStep: (stepIndex: number) => void;
  summary: GeometryTrackSummary;
  track: Track;
}) {
  const points = track.steps.map((step, index) => ({
    active: step.active,
    index,
    ...pointForPulse(index, track.steps.length),
  }));
  const polygonPoints = points
    .filter((point) => point.active)
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const rotation = summary.rotation ?? 0;

  return (
    <article className="grid grid-cols-1 gap-3 border border-zinc-800 bg-black/20 p-3 sm:grid-cols-[224px_minmax(0,1fr)]">
      <svg
        aria-label={`${track.name} circular rhythm`}
        className="h-56 w-56 justify-self-center"
        viewBox={`0 0 ${ringSize} ${ringSize}`}
      >
        <circle
          cx={center}
          cy={center}
          fill="none"
          r={radius}
          stroke="rgb(63 63 70)"
          strokeWidth="1"
        />
        {polygonPoints ? (
          <polygon
            fill="rgb(244 244 245 / 0.08)"
            points={polygonPoints}
            stroke="rgb(244 244 245)"
            strokeWidth="1.5"
          />
        ) : null}
        {points.map((point) => (
          <circle
            aria-label={`${track.name} pulse ${point.index + 1}`}
            className="cursor-pointer outline-none"
            cx={point.x}
            cy={point.y}
            fill={point.active ? "rgb(244 244 245)" : "rgb(9 9 11)"}
            key={point.index}
            onClick={() => onToggleStep(point.index)}
            onKeyDown={(event: KeyboardEvent<SVGCircleElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggleStep(point.index);
              }
            }}
            r={point.active ? 7 : 5}
            role="button"
            stroke={point.index === 0 ? "rgb(250 204 21)" : "rgb(113 113 122)"}
            strokeWidth={point.index % 4 === 0 ? 2 : 1}
            tabIndex={0}
          >
            <title>{`${track.name} pulse ${point.index + 1}`}</title>
          </circle>
        ))}
        <text
          dominantBaseline="middle"
          fill="rgb(212 212 216)"
          fontSize="11"
          textAnchor="middle"
          x={center}
          y={center - 6}
        >
          {summary.formula}
        </text>
        <text
          dominantBaseline="middle"
          fill="rgb(113 113 122)"
          fontSize="10"
          textAnchor="middle"
          x={center}
          y={center + 12}
        >
          {summary.interOnsetIntervals.join("-") || "rest"}
        </text>
      </svg>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="truncate text-sm text-zinc-100">{track.name}</h3>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">{summary.formula}</p>
          </div>
          <span
            className={cn(
              "shrink-0 border px-2 py-1 text-[10px]",
              summary.hasRhythmicOddity
                ? "border-zinc-600 text-zinc-300"
                : "border-amber-500/50 text-amber-200",
            )}
          >
            {summary.hasRhythmicOddity ? "oddity" : "paired"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
          <Metric label="onsets" value={summary.onsets.join(",") || "-"} />
          <Metric label="intervals" value={summary.interOnsetIntervals.join("-") || "-"} />
          <Metric label="vector" value={summary.fullIntervalVector.join(",")} />
          <Metric label="off-beat" value={`${summary.offBeatness}`} />
          <Metric label="density" value={`${Math.round(summary.density * 100)}%`} />
          <Metric label="evenness" value={`${summary.evenness}`} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-zinc-500">
            hits
            <input
              aria-label={`${track.name} hits`}
              className="mt-1 h-8 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
              max={track.steps.length}
              min={0}
              onChange={(event) =>
                onRegenerate(Number(event.target.value), rotation)
              }
              type="number"
              value={summary.onsets.length}
            />
          </label>
          <label className="text-[11px] text-zinc-500">
            rotation
            <input
              aria-label={`${track.name} rotation`}
              className="mt-1 h-8 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
              max={track.steps.length - 1}
              min={0}
              onChange={(event) =>
                onRegenerate(summary.onsets.length, Number(event.target.value))
              }
              type="number"
              value={rotation}
            />
          </label>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-zinc-900 bg-zinc-950 p-2">
      <div className="text-zinc-600">{label}</div>
      <div className="truncate font-mono text-zinc-300">{value}</div>
    </div>
  );
}

function pointForPulse(index: number, pulses: number) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / pulses;
  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
  };
}
