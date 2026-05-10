import Link from "next/link";

import { GlobalMusicControls } from "@/components/music/global-music-controls";
import { getAgentManifests } from "@/lib/agents/registry";
import { isGatewayConfigured } from "@/lib/ai/gateway";

export default function DashboardPage() {
  const manifests = getAgentManifests();
  const hasGatewayKey = isGatewayConfigured();
  const installedCount = manifests.filter(
    (manifest) => manifest.origin === "installed",
  ).length;
  const generatedCount = manifests.filter(
    (manifest) => manifest.origin === "generated",
  ).length;

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="text-xs text-zinc-500">/dashboard</div>
            <h1 className="mt-2 text-xl">ai-daw-tools</h1>
          </div>
          <div className="text-xs text-zinc-500">
            gateway {hasGatewayKey ? <span className="text-cyan-300">configured</span> : "missing"}
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <OriginBadge origin="installed" />
          <span>{installedCount} homegrown tools</span>
          <span className="text-zinc-700">/</span>
          <OriginBadge origin="generated" />
          <span>{generatedCount} generated tools</span>
          <span className="text-zinc-700">/</span>
          <Link href="/sessions/default" className="text-cyan-200 hover:text-cyan-100">
            open shared session
          </Link>
        </div>

        {!hasGatewayKey ? (
          <div className="mb-4 border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-100">
            AI generation is disabled until AI_GATEWAY_API_KEY is set in .env.local.
          </div>
        ) : null}

        <GlobalMusicControls />

        <div className="divide-y divide-zinc-800 border-y border-zinc-800">
          {manifests.map((manifest) => {
            const enabled = manifest.status === "enabled";
            const row = (
              <div className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_92px_78px_48px_72px_96px_120px]">
                <div>
                  <div className={enabled ? "text-zinc-100" : "text-zinc-600"}>
                    {manifest.slug}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">{manifest.description}</div>
                </div>
                <OriginBadge origin={manifest.origin} muted={!enabled} />
                <InstrumentBadge type={manifest.instrument.type} muted={!enabled} />
                <div className="text-xs text-zinc-500">L{manifest.level}</div>
                <div className={enabled ? "text-cyan-300" : "text-zinc-700"}>
                  {manifest.autonomy === "assist" ? "o" : "-"}
                </div>
                <MusicContextBadges
                  globalBpm={manifest.musicContext.globalBpm}
                  globalKey={manifest.musicContext.globalKey}
                  muted={!enabled}
                />
                <div className="text-right text-xs text-zinc-600">{manifest.status}</div>
              </div>
            );

            return enabled ? (
              <Link key={manifest.slug} href={manifest.route} className="block hover:bg-zinc-900/60">
                {row}
              </Link>
            ) : (
              <div key={manifest.slug}>{row}</div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function MusicContextBadges({
  globalBpm,
  globalKey,
  muted = false,
}: {
  globalBpm: boolean;
  globalKey: boolean;
  muted?: boolean;
}) {
  const enabledClass = muted
    ? "border-zinc-800 text-zinc-700"
    : "border-zinc-700 text-zinc-400";

  return (
    <div className="flex gap-1 text-[10px] uppercase tracking-[0.14em]">
      {globalBpm ? (
        <span className={`rounded-sm border px-1.5 py-1 ${enabledClass}`}>bpm</span>
      ) : null}
      {globalKey ? (
        <span className={`rounded-sm border px-1.5 py-1 ${enabledClass}`}>key</span>
      ) : null}
      {!globalBpm && !globalKey ? <span className="text-zinc-700">local</span> : null}
    </div>
  );
}

function InstrumentBadge({
  type,
  muted = false,
}: {
  type: "sample" | "synth" | "hybrid" | "effect" | "builder";
  muted?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-6 items-center justify-center rounded-sm border px-2 text-[10px] uppercase tracking-[0.16em] ${
        muted ? "border-zinc-800 text-zinc-700" : "border-zinc-700 text-zinc-400"
      }`}
    >
      {type}
    </span>
  );
}

function OriginBadge({
  origin,
  muted = false,
}: {
  origin: "installed" | "generated";
  muted?: boolean;
}) {
  const classes =
    origin === "installed"
      ? "border-cyan-300/40 text-cyan-200"
      : "border-fuchsia-300/40 text-fuchsia-200";

  return (
    <span
      className={`inline-flex h-6 items-center justify-center rounded-sm border px-2 text-[10px] uppercase tracking-[0.16em] ${
        muted ? "border-zinc-800 text-zinc-700" : classes
      }`}
    >
      {origin}
    </span>
  );
}
