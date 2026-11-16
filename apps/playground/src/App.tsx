import { OpfsStore, sealArtifact } from '@toolpa/artifact';
import { hashChain, type Chain } from '@toolpa/graph';
import { LiveSession } from '@toolpa/audio/live';
import { renderChain, type SampleBuffer, type WavFormat } from '@toolpa/audio';
import { MAX_SAMPLE_BYTES, decodeSample } from '@toolpa/samples';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cutoffFromSlider, cutoffToSlider, playgroundChain } from './model.ts';
import { ring, trace } from './telemetry.ts';

const SAMPLE_RATE = 44100;
const Q = 0.7071067811865476;

interface LoadedSample extends SampleBuffer {
  name: string;
  sha256: string;
  frames: number;
  bytes: Uint8Array;
}

function readNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function App() {
  const [source, setSource] = useState<'sine' | 'noise' | 'sample'>('sine');
  const [frequency, setFrequency] = useState('440');
  const [seed, setSeed] = useState('11');
  const [playbackRate, setPlaybackRate] = useState('1');
  const [cutoff, setCutoff] = useState(2000);
  const [q, setQ] = useState(Q);
  const [gain, setGain] = useState(0.25);
  const [format, setFormat] = useState<WavFormat>('pcm16');
  const [loaded, setLoaded] = useState<LoadedSample | null>(null);
  const [hash, setHash] = useState('');
  const [status, setStatus] = useState('Ready. Press Play to open the audio device.');
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renders, setRenders] = useState(0);
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [wavSha, setWavSha] = useState('');
  const [library, setLibrary] = useState<string[]>([]);
  const [storeReady, setStoreReady] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [parents, setParents] = useState<string[]>([]);
  const [traceText, setTraceText] = useState('');
  const sessionRef = useRef<LiveSession | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const storeRef = useRef<OpfsStore | null>(null);

  const draft = useMemo(
    () =>
      playgroundChain({
        sampleRate: SAMPLE_RATE,
        source,
        frequencyHz: readNumber(frequency),
        seed: readNumber(seed),
        sha256: loaded?.sha256 ?? '',
        playbackRate: readNumber(playbackRate),
        cutoffHz: cutoff,
        q,
        gain,
      }),
    [source, frequency, seed, playbackRate, cutoff, q, gain, loaded],
  );
  const chain: Chain | null = 'chain' in draft ? draft.chain : null;
  const chainError = 'error' in draft ? draft.error : '';

  useEffect(() => {
    trace.event('playground.ready', { sampleRate: SAMPLE_RATE });
    let cancelled = false;
    void OpfsStore.open(trace)
      .then(async (store) => {
        if (cancelled) return;
        storeRef.current = store;
        setLibrary(await store.list());
        setStoreReady(true);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!chain) {
      setHash('');
      return;
    }
    let cancelled = false;
    void hashChain(chain, trace).then(({ hash: next }) => {
      if (!cancelled) setHash(next);
    });
    return () => {
      cancelled = true;
    };
  }, [chain]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const session = sessionRef.current;
      session?.poll();
      const snap = session?.snapshot();
      if (snap) {
        setLevel(snap.level);
        setPeak(snap.peak);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    return () => {
      void sessionRef.current?.stop();
      void contextRef.current?.close();
    };
  }, []);

  function remember() {
    setTraceText(
      ring
        .snapshot()
        .map((record) => record.name)
        .slice(-40)
        .join('\n'),
    );
  }

  async function stop() {
    trace.event('ui.action', { action: 'stop' });
    const session = sessionRef.current;
    const context = contextRef.current;
    sessionRef.current = null;
    contextRef.current = null;
    setPlaying(false);
    if (session) {
      const stopped = await session.stop();
      setPeak(stopped.peak);
      setStatus(
        stopped.underruns === 0
          ? 'Stopped. No underruns.'
          : `Stopped. ${stopped.underruns} underruns.`,
      );
    }
      await context?.close();
      remember();
    }

  async function play() {
    if (!chain || playing) return;
    trace.event('ui.action', { action: 'play' });
    setError('');
    setStatus('Opening the audio device…');
    try {
      const context = new AudioContext({ sampleRate: chain.sampleRate });
      const session = new LiveSession(trace);
      const samples = loaded ? new Map<string, SampleBuffer>([[loaded.sha256, loaded]]) : undefined;
      const started = await session.start({ context, chain, samples });
      sessionRef.current = session;
      contextRef.current = context;
      setPlaying(true);
      setLevel(0);
      setPeak(0);
      setStatus(
        `Playing at ${context.sampleRate} Hz. Base latency ${started.baseLatencyMs.toFixed(1)} ms, output ${started.outputLatencyMs.toFixed(1)} ms.`,
      );
      remember();
    } catch (caught) {
      setPlaying(false);
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('Playback failed.');
    }
  }

  async function renderOffline() {
    if (!chain || rendering) return;
    trace.event('ui.action', { action: 'render' });
    setRendering(true);
    setError('');
    setStatus('Rendering 1.0 s offline…');
    try {
      const samples = loaded ? new Map<string, SampleBuffer>([[loaded.sha256, loaded]]) : undefined;
      const rendered = await renderChain({ chain, durationSeconds: 1, samples, format }, trace);
      setWavSha(rendered.wavSha256);
      setRenders((count) => count + 1);
      const wav = new Uint8Array(rendered.wav.byteLength);
      wav.set(rendered.wav);
      const blob = new Blob([wav], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `toolpa-${rendered.hash.slice(0, 8)}.wav`;
      anchor.click();
      URL.revokeObjectURL(url);
      trace.event('playground.render', {
        hash: rendered.hash,
        wavSha256: rendered.wavSha256,
        realtime: rendered.realtime,
      });
      trace.event('export.wav', { hash: rendered.hash, wavSha256: rendered.wavSha256, format });
      remember();
      setStatus(
        `Rendered 1.0 s ${format} in ${rendered.renderMs.toFixed(0)} ms, ${rendered.realtime.toFixed(1)}× realtime.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('Offline render failed.');
    } finally {
      setRendering(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError('');
    if (file.size > MAX_SAMPLE_BYTES) {
      trace.event('source.load', { bytes: file.size, rejected: true, code: 'LOADER_TOO_LARGE' });
      trace.event('error', { code: 'LOADER_TOO_LARGE', where: 'source.load', message: 'file is larger than 50 MB' });
      setError('LOADER_TOO_LARGE: file is larger than 50 MB');
      setStatus('That file is larger than 50 MB.');
      remember();
      return;
    }
    setStatus(`Decoding ${file.name}…`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const decoded = await decodeSample(bytes, trace);
      setLoaded({
        name: file.name,
        sha256: decoded.sha256,
        sampleRate: decoded.sampleRate,
        pcm: decoded.pcm,
        frames: decoded.frames,
        bytes,
      });
      setSource('sample');
      setStatus(`${file.name} · ${decoded.frames} frames at ${decoded.sampleRate} Hz.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('Could not decode that file.');
    }
  }

  async function saveArtifact() {
    const store = storeRef.current;
    if (!store || !chain) return;
    trace.event('ui.action', { action: 'save' });
    setError('');
    try {
      const sealed = await sealArtifact({ chain, parents: loadedId ? [loadedId] : [] }, trace);
      await store.save(sealed);
      if (source === 'sample' && loaded) await store.saveSample(loaded.sha256, loaded.bytes);
      setLoadedId(sealed.id);
      setParents(sealed.artifact.parents);
      setLibrary(await store.list());
      remember();
      setStatus(`Saved ${sealed.id.slice(0, 12)}…`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('Save failed.');
    }
  }

  async function loadArtifact(id: string) {
    const store = storeRef.current;
    if (!store) return;
    setError('');
    try {
      const sealed = await store.load(id);
      if (!sealed) {
        setError('That artifact is not in OPFS.');
        return;
      }
      const next = sealed.artifact.chain;
      setSource(next.source.type);
      if (next.source.type === 'sine') setFrequency(String(next.source.frequencyHz));
      if (next.source.type === 'noise') setSeed(String(next.source.seed));
      if (next.source.type === 'sample') {
        setPlaybackRate(String(next.source.playbackRate));
        const bytes = await store.loadSample(next.source.sha256);
        if (!bytes) {
          setLoaded(null);
          setError('The sample blob for this chain is not in OPFS.');
        } else {
          const decoded = await decodeSample(bytes, trace);
          setLoaded({
            name: 'Saved sample',
            sha256: decoded.sha256,
            sampleRate: decoded.sampleRate,
            pcm: decoded.pcm,
            frames: decoded.frames,
            bytes,
          });
        }
      }
      setCutoff(next.effect.cutoffHz);
      setQ(next.effect.q);
      setGain(next.effect.gain);
      setParents(sealed.artifact.parents);
      setLoadedId(id);
      setStatus(`Loaded ${id.slice(0, 12)}…`);
      remember();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('Load failed.');
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
      <header className="flex flex-col gap-3">
        <p className="text-sm tracking-wide text-muted-foreground uppercase">Toolpa</p>
        <h1 className="text-3xl font-medium tracking-tight md:text-5xl">One chain, heard two ways.</h1>
        <p className="max-w-xl text-muted-foreground">
          A sine, seeded noise, or a sample runs through a lowpass and a gain. Play it live, then render the same graph to WAV.
        </p>
      </header>

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="flex flex-col gap-6 rounded-2xl border bg-card p-4 md:p-6">
          <div className="flex flex-col gap-3">
            <Label>Source</Label>
            <div className="flex flex-wrap gap-2">
              {(['sine', 'noise', 'sample'] as const).map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  variant={source === kind ? 'default' : 'outline'}
                  onClick={() => setSource(kind)}
                >
                  {kind === 'sine' ? 'Sine' : kind === 'noise' ? 'Noise' : 'Sample'}
                </Button>
              ))}
            </div>
            {source === 'sine' ? (
              <Field label="Frequency" hint="Hz">
                <Input
                  inputMode="decimal"
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value)}
                  aria-label="Frequency"
                />
              </Field>
            ) : null}
            {source === 'noise' ? (
              <Field label="Seed" hint="integer">
                <Input inputMode="numeric" value={seed} onChange={(event) => setSeed(event.target.value)} aria-label="Seed" />
              </Field>
            ) : null}
            {source === 'sample' ? (
              <div className="flex flex-col gap-3">
                <Field label="Audio file" hint="WAV or MP3">
                  <Input
                    type="file"
                    accept=".wav,.mp3,audio/wav,audio/mpeg,audio/mp3"
                    aria-label="Audio file"
                    onChange={(event) => void onFile(event.target.files?.[0])}
                  />
                </Field>
                <Field label="Playback rate" hint="0.25–4">
                  <Input
                    inputMode="decimal"
                    value={playbackRate}
                    onChange={(event) => setPlaybackRate(event.target.value)}
                    aria-label="Playback rate"
                  />
                </Field>
                <p className="text-sm text-muted-foreground">
                  {loaded
                    ? `${loaded.name} · ${loaded.sha256.slice(0, 12)}…`
                    : 'Load a WAV or MP3. The chain is identified by the file bytes, not the name.'}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            <Label>Tone</Label>
            <Field label="Cutoff" hint="Hz, exact">
              <Input
                inputMode="decimal"
                aria-label="Cutoff Hz"
                value={String(cutoff)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) setCutoff(next);
                }}
              />
            </Field>
            <Field label="Gain amount" hint="0–1">
              <Input
                inputMode="decimal"
                aria-label="Gain amount"
                value={String(gain)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) setGain(next);
                }}
              />
            </Field>
            <ToneSlider
              label="Cutoff"
              valueLabel={`${cutoff} Hz`}
              min={0}
              max={1000}
              step={1}
              value={cutoffToSlider(cutoff)}
              onChange={(position) => setCutoff(cutoffFromSlider(position))}
            />
            <ToneSlider
              label="Resonance"
              valueLabel={q.toFixed(2)}
              min={0.1}
              max={18}
              step={0.01}
              value={q}
              onChange={setQ}
            />
            <ToneSlider
              label="Gain"
              valueLabel={gain.toFixed(2)}
              min={0}
              max={1}
              step={0.01}
              value={gain}
              onChange={setGain}
            />
          </div>
          {chainError ? <p className="text-sm text-destructive">{chainError}</p> : null}
        </section>

        <section className="flex flex-col gap-5 rounded-2xl border bg-card p-4 md:p-6">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void play()} disabled={!chain || playing}>
              Play
            </Button>
            <Button type="button" variant="outline" onClick={() => void stop()} disabled={!playing}>
              Stop
            </Button>
            <Button type="button" variant="secondary" onClick={() => void renderOffline()} disabled={!chain || rendering}>
              {rendering ? 'Rendering…' : 'Render 1s WAV'}
            </Button>
            {(['pcm16', 'pcm24', 'float32'] as const).map((choice) => (
              <Button
                key={choice}
                type="button"
                variant={format === choice ? 'default' : 'outline'}
                onClick={() => setFormat(choice)}
              >
                {choice === 'pcm16' ? '16-bit' : choice === 'pcm24' ? '24-bit' : '32-bit float'}
              </Button>
            ))}
            <Button type="button" variant="outline" onClick={() => void saveArtifact()} disabled={!chain || !storeReady}>
              Save artifact
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                trace.event('ui.action', { action: 'trace' });
                const lines = ring.snapshot().map((record) => JSON.stringify(record)).join('\n');
                const copy = new TextEncoder().encode(lines);
                const blob = new Blob([copy], { type: 'application/x-ndjson' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = 'toolpa-trace.ndjson';
                anchor.click();
                URL.revokeObjectURL(url);
                remember();
              }}
            >
              Download trace
            </Button>
          </div>

          <div className="flex flex-col gap-2" data-testid="library">
            <Label>Saved in this browser</Label>
            {library.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing saved yet. The chain file stays in OPFS on this origin.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {library.map((id) => (
                  <Button key={id} type="button" variant="outline" aria-label={id} onClick={() => void loadArtifact(id)}>
                    {id.slice(0, 8)}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label>Meter</Label>
              <p className="font-mono text-xs text-muted-foreground" data-testid="level">
                {level.toFixed(3)} peak {peak.toFixed(3)}
              </p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${Math.min(100, level * 100)}%` }} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Graph hash</Label>
            <p className="font-mono text-xs break-all text-muted-foreground" data-testid="hash">
              {hash || '—'}
            </p>
          </div>

          <p className="text-sm" data-testid="status">
            {status}
          </p>
          <p className="sr-only" data-testid="render-count">
            {renders}
          </p>
          {error ? (
            <p className="text-sm text-destructive" data-testid="error">
              {error}
            </p>
          ) : null}
          <p className="sr-only" data-testid="parents">
            {parents.join(' ')}
          </p>
          <pre data-testid="trace" className="max-h-24 overflow-auto font-mono text-xs text-muted-foreground">
            {traceText}
          </pre>
          {wavSha ? (
            <p className="font-mono text-xs break-all text-muted-foreground" data-testid="wav-sha">
              {wavSha}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function ToneSlider({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground">{valueLabel}</span>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
    </div>
  );
}
