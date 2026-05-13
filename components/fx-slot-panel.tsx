"use client";

import { Dices, SlidersHorizontal } from "lucide-react";

import {
  BUILT_IN_FX_MANIFESTS,
  getFxSlotParams,
  type FxFamily,
  type FxKind,
  type FxParameterManifest,
  type FxParameterValue,
  type FxProbability,
  type FxSlot,
} from "@/lib/audio/fx-manifest";
import {
  useFxPatternStore,
  useToolFxPattern,
} from "@/lib/audio/use-fx-pattern";
import { cn } from "@/lib/utils";

export function FxSlotPanel({
  className,
  toolId,
}: {
  className?: string;
  toolId: string;
}) {
  const pattern = useToolFxPattern(toolId);
  const setFxSlotEffect = useFxPatternStore((state) => state.setFxSlotEffect);
  const setFxSlotProbability = useFxPatternStore(
    (state) => state.setFxSlotProbability,
  );
  const setFxSlotParam = useFxPatternStore((state) => state.setFxSlotParam);
  const setFxSlotWet = useFxPatternStore((state) => state.setFxSlotWet);

  return (
    <section className={cn("border-b border-zinc-800 p-4", className)}>
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
        <SlidersHorizontal className="size-4 text-zinc-200" />
        fx slots
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {pattern.slots.map((slot) => (
          <FxSlotControl
            key={slot.id}
            slot={slot}
            onEffectChange={(effect) => setFxSlotEffect(toolId, slot.id, effect)}
            onProbabilityChange={(patch) =>
              setFxSlotProbability(toolId, slot.id, patch)
            }
            onParamChange={(key, value) =>
              setFxSlotParam(toolId, slot.id, key, value)
            }
            onWetChange={(wet) => setFxSlotWet(toolId, slot.id, wet)}
          />
        ))}
      </div>
    </section>
  );
}

function FxSlotControl({
  onEffectChange,
  onParamChange,
  onProbabilityChange,
  onWetChange,
  slot,
}: {
  onEffectChange: (effect: FxKind) => void;
  onParamChange: (key: string, value: FxParameterValue) => void;
  onProbabilityChange: (patch: Partial<FxProbability>) => void;
  onWetChange: (wet: number) => void;
  slot: FxSlot;
}) {
  const manifest = BUILT_IN_FX_MANIFESTS.find(
    (candidate) => candidate.slug === slot.effect,
  );
  const probabilityDisabled = slot.effect === "none";
  const wetDisabled = probabilityDisabled || slot.probability.enabled;
  const params = getFxSlotParams(slot);

  return (
    <div className="grid gap-2 border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
        <span>slot {slot.id}</span>
        <span className="text-zinc-300">{manifest?.name ?? slot.effect}</span>
      </div>
      <label className="text-xs text-zinc-500">
        effect
        <select
          className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
          value={slot.effect}
          onChange={(event) => onEffectChange(event.currentTarget.value as FxKind)}
        >
          {fxFamilies.map(([family, label]) => {
            const effects = BUILT_IN_FX_MANIFESTS.filter(
              (effect) => effect.family === family,
            );
            if (effects.length === 0) {
              return null;
            }

            return (
              <optgroup key={family} label={label}>
                {effects.map((effect) => (
                  <option key={effect.slug} value={effect.slug}>
                    {effect.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
      {manifest ? (
        <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
          <span className="rounded-sm border border-zinc-800 px-1.5 py-0.5">
            {manifest.model}
          </span>
          {manifest.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-sm border border-zinc-800 px-1.5 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {manifest && manifest.parameters.length > 0 ? (
        <div className="grid gap-2 border-t border-zinc-800 pt-2">
          {manifest.parameters.map((parameter) => (
            <FxParameterControl
              key={parameter.key}
              parameter={parameter}
              value={params[parameter.key]}
              onChange={(value) => onParamChange(parameter.key, value)}
            />
          ))}
        </div>
      ) : null}
      <label className="grid gap-1 text-xs text-zinc-500">
        <span className="flex items-center justify-between gap-3">
          wet
          <span className="text-zinc-300">{Math.round(slot.wet * 100)}%</span>
        </span>
        <input
          className="w-full accent-zinc-200"
          disabled={wetDisabled}
          max={1}
          min={0}
          step={0.01}
          type="range"
          value={slot.wet}
          onChange={(event) => onWetChange(Number(event.currentTarget.value))}
        />
      </label>
      <div className="grid gap-2 border-t border-zinc-800 pt-2">
        <label className="flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-2">
            <Dices className="size-3.5 text-zinc-300" />
            probability
          </span>
          <input
            className="size-4 accent-zinc-200"
            disabled={probabilityDisabled}
            type="checkbox"
            checked={slot.probability.enabled}
            onChange={(event) =>
              onProbabilityChange({ enabled: event.currentTarget.checked })
            }
          />
        </label>
        {slot.probability.enabled ? (
          <div className="grid gap-2">
            <NumberControl
              label="every"
              max={128}
              min={1}
              suffix=" steps"
              value={slot.probability.intervalSteps}
              onChange={(intervalSteps) => onProbabilityChange({ intervalSteps })}
            />
            <RangeControl
              label="chance"
              value={slot.probability.chance}
              onChange={(chance) => onProbabilityChange({ chance })}
            />
            <RangeControl
              label="miss wet"
              value={slot.probability.missWet}
              onChange={(missWet) => onProbabilityChange({ missWet })}
            />
            <div className="grid grid-cols-2 gap-2">
              <RangeControl
                label="min wet"
                value={slot.probability.minWet}
                onChange={(minWet) => onProbabilityChange({ minWet })}
              />
              <RangeControl
                label="max wet"
                value={slot.probability.maxWet}
                onChange={(maxWet) => onProbabilityChange({ maxWet })}
              />
            </div>
            <NumberControl
              label="smooth"
              max={2000}
              min={0}
              step={5}
              suffix=" ms"
              value={slot.probability.smoothMs}
              onChange={(smoothMs) => onProbabilityChange({ smoothMs })}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const fxFamilies: Array<[FxFamily, string]> = [
  ["utility", "Utility"],
  ["spx", "Yamaha SPX"],
  ["fx500", "Yamaha FX500"],
  ["a3000", "Yamaha A3000"],
  ["motif", "Yamaha Motif"],
  ["emu", "E-mu"],
];

function FxParameterControl({
  onChange,
  parameter,
  value,
}: {
  onChange: (value: FxParameterValue) => void;
  parameter: FxParameterManifest;
  value: FxParameterValue | undefined;
}) {
  if (parameter.options && parameter.options.length > 0) {
    return (
      <label className="text-xs text-zinc-500">
        {parameter.label}
        <select
          className="mt-1 h-8 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
          value={String(value ?? parameter.options[0]?.value ?? "")}
          onChange={(event) => {
            const option = parameter.options?.find(
              (candidate) => String(candidate.value) === event.currentTarget.value,
            );
            if (option) {
              onChange(option.value);
            }
          }}
        >
          {parameter.options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (typeof value === "boolean") {
    return (
      <label className="flex items-center justify-between gap-3 text-xs text-zinc-500">
        {parameter.label}
        <input
          checked={value}
          className="size-4 accent-zinc-200"
          type="checkbox"
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      </label>
    );
  }

  const numericValue = typeof value === "number" ? value : parameter.min ?? 0;

  return (
    <label className="grid gap-1 text-xs text-zinc-500">
      <span className="flex items-center justify-between gap-3">
        {parameter.label}
        <span className="text-zinc-300">
          {formatParameterValue(numericValue, parameter.unit)}
        </span>
      </span>
      <input
        className="w-full accent-zinc-200"
        max={parameter.max ?? 1}
        min={parameter.min ?? 0}
        step={parameter.step ?? 0.01}
        type="range"
        value={numericValue}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function RangeControl({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-1 text-xs text-zinc-500">
      <span className="flex items-center justify-between gap-3">
        {label}
        <span className="text-zinc-300">{formatPercent(value)}</span>
      </span>
      <input
        className="w-full accent-zinc-200"
        max={1}
        min={0}
        step={0.01}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function NumberControl({
  label,
  max,
  min,
  onChange,
  step = 1,
  suffix,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  suffix: string;
  value: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-zinc-500">
      {label}
      <span className="flex items-center gap-1">
        <input
          className="h-8 w-20 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-right text-zinc-100"
          max={max}
          min={min}
          step={step}
          type="number"
          value={value}
          onChange={(event) => {
            if (event.currentTarget.value === "") {
              return;
            }
            const nextValue = Number(event.currentTarget.value);
            if (Number.isFinite(nextValue)) {
              onChange(Math.min(max, Math.max(min, nextValue)));
            }
          }}
        />
        <span className="w-10 text-zinc-400">{suffix}</span>
      </span>
    </label>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatParameterValue(value: number, unit?: string): string {
  const rounded = Math.abs(value) >= 100
    ? Math.round(value)
    : Number(value.toFixed(2));

  return unit ? `${rounded}${unit}` : String(rounded);
}
