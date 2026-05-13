"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  Boxes,
  CircleAlert,
  ExternalLink,
  Hammer,
  ListFilter,
  RotateCcw,
} from "lucide-react";

import { DashboardOnboarding } from "@/app/dashboard/dashboard-onboarding";
import { GlobalMusicControls } from "@/components/music/global-music-controls";
import type { AgentManifest } from "@/lib/agents/contract";
import type { GeneratedToolAudit } from "@/lib/agents/generated-audit";
import type { PlatformHardeningAudit } from "@/lib/agents/platform-hardening";

type PrimaryFilter = "installed-l1" | "generated-l1" | "l2-builders";
type SecondaryFilter =
  | "all"
  | "sample"
  | "synth"
  | "effect"
  | "hybrid"
  | "midi"
  | "pattern"
  | "midi-clip"
  | "synth-scene"
  | "audio-stream";

type ToolSuiteDashboardProps = {
  generatedAudit: GeneratedToolAudit;
  hasGatewayKey: boolean;
  manifests: AgentManifest[];
  platformAudit: PlatformHardeningAudit;
};

const primaryFilters: Array<{ label: string; value: PrimaryFilter }> = [
  { label: "Installed L1", value: "installed-l1" },
  { label: "Generated L1", value: "generated-l1" },
  { label: "L2 Builders", value: "l2-builders" },
];

const secondaryFilters: Array<{ label: string; value: SecondaryFilter }> = [
  { label: "All", value: "all" },
  { label: "Sample", value: "sample" },
  { label: "Synth", value: "synth" },
  { label: "Effect", value: "effect" },
  { label: "Hybrid", value: "hybrid" },
  { label: "MIDI", value: "midi" },
  { label: "Pattern", value: "pattern" },
  { label: "MIDI Clip", value: "midi-clip" },
  { label: "SynthScene", value: "synth-scene" },
  { label: "Audio Stream", value: "audio-stream" },
];

export function ToolSuiteDashboard({
  generatedAudit,
  hasGatewayKey,
  manifests,
  platformAudit,
}: ToolSuiteDashboardProps) {
  const [primaryFilter, setPrimaryFilter] = useState<PrimaryFilter>("installed-l1");
  const [secondaryFilter, setSecondaryFilter] = useState<SecondaryFilter>("all");
  const summary = useMemo(
    () => createSuiteSummary(manifests, generatedAudit, platformAudit),
    [manifests, generatedAudit, platformAudit],
  );
  const healthIssues = [
    ...platformAudit.issues.map((issue) => ({
      detail: issue.detail,
      id: issue.id,
      slug: issue.slug,
    })),
    ...generatedAudit.issues.map((issue) => ({
      detail: issue.detail,
      id: issue.id,
      slug: issue.slug,
    })),
  ];
  const visibleManifests = manifests
    .filter((manifest) => matchesPrimaryFilter(manifest, primaryFilter))
    .filter((manifest) => matchesSecondaryFilter(manifest, secondaryFilter));

  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100 sm:p-6">
      <DashboardOnboarding />
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="text-xs text-zinc-500">/dashboard</div>
            <h1 className="mt-2 text-2xl">AI-native instrument suite</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Browse installed L1 instruments, rebuild generated L1 instruments,
              and launch constrained L2 builders that produce more tools.
            </p>
          </div>
          <Link
            className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-zinc-200/60 bg-zinc-100 px-3 text-xs font-medium text-zinc-950 hover:bg-white"
            href="/build"
          >
            <Hammer className="size-4" />
            build L1 tool
          </Link>
        </header>

        {!hasGatewayKey ? (
          <div className="mb-4 flex items-start gap-2 border border-amber-400/40 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            AI generation is disabled until AI_GATEWAY_API_KEY is set in .env.local.
          </div>
        ) : null}

        <GlobalMusicControls />

        <section className="mb-4 grid gap-3 md:grid-cols-5">
          <MetricCard icon={<Boxes className="size-4" />} label="installed L1" value={summary.installedL1} />
          <MetricCard icon={<Bot className="size-4" />} label="generated L1" value={summary.generatedL1} />
          <MetricCard icon={<Hammer className="size-4" />} label="L2 builders" value={summary.l2Builders} />
          <MetricCard
            icon={<Boxes className="size-4" />}
            label="platform gates"
            value={platformAudit.status}
          />
          <MetricCard
            icon={<CircleAlert className="size-4" />}
            label="generated audit"
            value={`${generatedAudit.readyCount}/${generatedAudit.generatedCount}`}
          />
        </section>

        <section className="mb-4 border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
            <ListFilter className="size-4" />
            catalog filters
          </div>
          <div className="flex flex-wrap gap-2">
            {primaryFilters.map((filter) => (
              <button
                className={filterButtonClass(primaryFilter === filter.value)}
                key={filter.value}
                onClick={() => setPrimaryFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-900 pt-3">
            {secondaryFilters.map((filter) => (
              <button
                className={secondaryButtonClass(secondaryFilter === filter.value)}
                key={filter.value}
                onClick={() => setSecondaryFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                suite health
              </div>
              <p className="mt-1 text-sm text-zinc-300">{summary.healthLabel}</p>
            </div>
            <span className={auditStatusClass(summary.healthStatus)}>
              {summary.healthStatus}
            </span>
          </div>
          {healthIssues.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {healthIssues.slice(0, 6).map((issue) => (
                <div
                  className="border border-zinc-900 bg-black/20 p-2 text-xs leading-5 text-zinc-400"
                  key={issue.id}
                >
                  <span className="font-mono text-zinc-200">{issue.slug ?? issue.id}</span>
                  : {issue.detail}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs leading-5 text-zinc-500">
              L1/L2 platform gates pass, and generated tools have manifests, routes, tests, and registry metadata aligned.
            </p>
          )}
        </section>

        <section aria-label="tool catalog" className="grid gap-3">
          <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
            <span>{visibleManifests.length} tools shown</span>
            <span>{secondaryFilter}</span>
          </div>
          {visibleManifests.length === 0 ? (
            <div className="border border-zinc-800 bg-zinc-950 p-6 text-center text-sm text-zinc-500">
              No tools match these filters.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleManifests.map((manifest) => (
                <ToolCard key={manifest.slug} manifest={manifest} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ToolCard({ manifest }: { manifest: AgentManifest }) {
  const enabled = manifest.status === "enabled";
  const isGeneratedL1 = manifest.level === 1 && manifest.origin === "generated";
  const isBuilder = manifest.level === 2;

  return (
    <article className="flex min-h-64 flex-col justify-between border border-zinc-800 bg-zinc-950 p-4">
      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className={enabled ? "text-lg text-zinc-100" : "text-lg text-zinc-600"}>
              {manifest.name}
            </h2>
            <div className="mt-1 font-mono text-xs text-zinc-600">{manifest.slug}</div>
          </div>
          <span className="shrink-0 rounded-sm border border-zinc-800 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            L{manifest.level} {manifest.origin}
          </span>
        </div>

        <p className="text-sm leading-6 text-zinc-500">{manifest.description}</p>

        <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em]">
          <Tag>{manifest.instrument.type}</Tag>
          <Tag>{manifest.instrument.document}</Tag>
          <Tag>{manifest.instrument.workflow}</Tag>
          <Tag>{manifest.status}</Tag>
        </div>

        {manifest.capabilities.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {manifest.capabilities.slice(0, 5).map((capability) => (
              <span className="rounded-sm bg-zinc-900 px-2 py-1 text-[11px] text-zinc-500" key={capability}>
                {capability}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <CatalogLink disabled={!enabled} href={manifest.route}>
          <ExternalLink className="size-4" />
          {isBuilder ? "open builder" : "open"}
        </CatalogLink>
        {isGeneratedL1 ? (
          <CatalogLink disabled={!enabled} href={`/build?edit=${manifest.slug}`}>
            <RotateCcw className="size-4" />
            rebuild
          </CatalogLink>
        ) : null}
      </div>
    </article>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl text-zinc-100">{value}</div>
    </div>
  );
}

function CatalogLink({
  children,
  disabled,
  href,
}: {
  children: ReactNode;
  disabled: boolean;
  href: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-zinc-900 px-3 text-xs text-zinc-700">
        {children}
      </span>
    );
  }

  return (
    <Link
      className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-zinc-700 px-3 text-xs text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
      href={href}
    >
      {children}
    </Link>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-sm border border-zinc-800 px-2 py-1 text-zinc-500">
      {children}
    </span>
  );
}

function createSuiteSummary(
  manifests: AgentManifest[],
  generatedAudit: GeneratedToolAudit,
  platformAudit: PlatformHardeningAudit,
) {
  const installedL1 = manifests.filter(
    (manifest) => manifest.level === 1 && manifest.origin === "installed",
  ).length;
  const generatedL1 = manifests.filter(
    (manifest) => manifest.level === 1 && manifest.origin === "generated",
  ).length;
  const l2Builders = manifests.filter((manifest) => manifest.level === 2).length;
  const healthStatus: GeneratedToolAudit["status"] | PlatformHardeningAudit["status"] =
    platformAudit.status === "attention" || generatedAudit.status === "attention"
      ? "attention"
      : generatedAudit.status === "empty"
        ? "empty"
        : "ready";
  const healthLabel =
    platformAudit.status === "attention"
      ? platformAudit.summary
      : generatedAudit.generatedCount === 0
      ? "Installed instruments and L2 builders are ready; generated registry is empty."
      : generatedAudit.summary;

  return {
    generatedL1,
    healthLabel,
    healthStatus,
    installedL1,
    l2Builders,
  };
}

function matchesPrimaryFilter(manifest: AgentManifest, filter: PrimaryFilter) {
  if (filter === "installed-l1") {
    return manifest.level === 1 && manifest.origin === "installed";
  }
  if (filter === "generated-l1") {
    return manifest.level === 1 && manifest.origin === "generated";
  }
  return manifest.level === 2;
}

function matchesSecondaryFilter(manifest: AgentManifest, filter: SecondaryFilter) {
  if (filter === "all") {
    return true;
  }
  if (manifest.level === 2) {
    return manifest.slug.includes(filter) || manifest.instrument.workflow.includes(filter);
  }
  return manifest.instrument.type === filter || manifest.instrument.document === filter;
}

function filterButtonClass(active: boolean) {
  return [
    "inline-flex h-9 items-center gap-2 rounded-sm border px-3 text-xs",
    active
      ? "border-zinc-200 bg-zinc-100 text-zinc-950"
      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600",
  ].join(" ");
}

function secondaryButtonClass(active: boolean) {
  return [
    "inline-flex h-8 items-center gap-2 rounded-sm border px-2.5 text-[11px]",
    active
      ? "border-zinc-500 bg-zinc-900 text-zinc-100"
      : "border-zinc-900 bg-zinc-950 text-zinc-600 hover:border-zinc-700",
  ].join(" ");
}

function auditStatusClass(status: GeneratedToolAudit["status"] | PlatformHardeningAudit["status"]) {
  const base =
    "inline-flex items-center gap-2 rounded-sm border px-2 py-1 text-[10px] uppercase tracking-[0.14em]";
  if (status === "ready") {
    return `${base} border-emerald-400/40 bg-emerald-400/10 text-emerald-100`;
  }
  if (status === "attention") {
    return `${base} border-amber-400/40 bg-amber-400/10 text-amber-100`;
  }
  return `${base} border-zinc-800 bg-zinc-900 text-zinc-500`;
}
