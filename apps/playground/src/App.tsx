import type { PromptInstrument } from '@toolpa/agent';
import { ArtifactError, DurableStore, packToolpa, sealArtifact, unpackToolpa, type ArtifactStore } from '@toolpa/artifact';
import { hashChain, type Chain } from '@toolpa/graph';
import { LiveSession } from '@toolpa/audio/live';
import { lowerPromptGraph, renderChain, type SampleBuffer, type WavFormat } from '@toolpa/audio';
import { attachInput, keyboardNote, requestMidiAccess } from '@toolpa/midi';
import { MAX_SAMPLE_BYTES, decodeSample } from '@toolpa/samples';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cutoffFromSlider, cutoffToSlider, playgroundChain } from './model.ts';
import { PromptBar, type LoadedGeneration } from './PromptBar.tsx';
import { ROLL_MIDIS, ROLL_STEPS, STUDIO_DEVICES, cellKey, composeStudio, describeExport, notesFromRoll } from './studio.ts';
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
  const [dropping, setDropping] = useState(false);
  const [rack, setRack] = useState<string[]>([]);
  const [rackStatus, setRackStatus] = useState('Pick devices, then compose.');
  const [roll, setRoll] = useState<string[]>(['0:60']);
  const [exportStatus, setExportStatus] = useState('Exports stay in this browser.');
  const [exporting, setExporting] = useState(false);
  const [promptDoc, setPromptDoc] = useState<PromptInstrument | null>(null);
  const [promptHash, setPromptHash] = useState('');
  const [keyboardMidi, setKeyboardMidi] = useState('');
  const [midiLabel, setMidiLabel] = useState('Computer keyboard');
  const sessionRef = useRef<LiveSession | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const storeRef = useRef<ArtifactStore | null>(null);
  const toolpaFileRef = useRef<HTMLInputElement | null>(null);

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
    void DurableStore.open(trace)
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (!promptDoc) return;
      const midi = keyboardNote(event.key);
      if (midi === null) return;
      event.preventDefault();
      setKeyboardMidi(String(midi));
      setRoll((current) => (current.some((item) => item.endsWith(`:${midi}`)) ? current : [...current, cellKey(Math.min(7, current.length), midi)]));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [promptDoc]);

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

  function voiced(doc: PromptInstrument): PromptInstrument {
    const notes = notesFromRoll(roll).slice(0, 8).map((note) => ({ midi: note.midi, step: note.startTick / 480, velocity: note.velocity }));
    return notes.length > 0 ? { ...doc, notes } : doc;
  }

  function loadGeneration(item: LoadedGeneration) {
    setPromptDoc(item.document);
    setPromptHash(item.hash);
    setRoll(item.document.notes.map((note) => cellKey(note.step, note.midi)));
    applyChain(item.chain, null);
    setStatus(`${item.label}. ${item.hash.slice(0, 12)}`);
  }

  async function saveGeneration(item: LoadedGeneration) {
    trace.event('ui.action', { action: 'save-generation' });
    const packed = await packToolpa({ chain: item.chain, title: item.document.name, name: item.document.name, parents: [], seq: 1, samples: [] }, trace);
    const filename = `${packed.name}-${packed.graphHash.slice(0, 12)}.toolpa`;
    const copy = new Uint8Array(packed.bytes.byteLength);
    copy.set(packed.bytes);
    const blob = new Blob([copy], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(`Saved ${packed.graphHash.slice(0, 12)}`);
  }

  async function connectMidi() {
    try {
      const access = await requestMidiAccess(undefined, trace);
      const input = [...access.inputs.values()].find((port) => port.state === 'connected');
      if (!input) {
        setMidiLabel('Computer keyboard');
        setStatus('Web MIDI has no input. Play from the computer keyboard.');
        return;
      }
      attachInput(access, input.id, (event) => {
        if (event.type !== 'note-on' || !promptDoc) return;
        setKeyboardMidi(String(event.midi));
        setRoll((current) => (current.some((item) => item.endsWith(`:${event.midi}`)) ? current : [...current, cellKey(Math.min(7, current.length), event.midi)]));
      }, trace);
      setMidiLabel('Web MIDI');
    } catch (caught) {
      setMidiLabel('Computer keyboard');
      setStatus(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function play() {
    if (playing || (!chain && !promptDoc)) return;
    trace.event('ui.action', { action: 'play' });
    setError('');
    setStatus('Opening the audio device…');
    try {
      const context = new AudioContext({ sampleRate: chain?.sampleRate ?? 44100 });
      const session = new LiveSession(trace);
      const started = promptDoc
        ? await session.startNode({ context, ...lowerPromptGraph(voiced(promptDoc), 1), hash: promptHash || 'prompt' })
        : await session.start({ context, chain: chain as Chain, samples: loaded ? new Map<string, SampleBuffer>([[loaded.sha256, loaded]]) : undefined });
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

  useEffect(() => {
    if (!playing || !promptDoc) return;
    const notes = notesFromRoll(roll).slice(0, 8).map((note) => ({ midi: note.midi, step: note.startTick / 480, velocity: note.velocity }));
    const graph = lowerPromptGraph(notes.length > 0 ? { ...promptDoc, notes } : promptDoc, 1);
    void sessionRef.current?.update(graph.node, promptHash || 'prompt', graph.vfs);
  }, [playing, promptDoc, roll, promptHash]);

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

  function applyChain(next: Chain, sample: LoadedSample | null) {
    setSource(next.source.type);
    if (next.source.type === 'sine') setFrequency(String(next.source.frequencyHz));
    if (next.source.type === 'noise') setSeed(String(next.source.seed));
    if (next.source.type === 'sample') {
      setPlaybackRate(String(next.source.playbackRate));
      setLoaded(sample);
    } else {
      setLoaded(null);
    }
    setCutoff(next.effect.cutoffHz);
    setQ(next.effect.q);
    setGain(next.effect.gain);
  }

  async function downloadToolpa() {
    if (!chain) return;
    trace.event('ui.action', { action: 'export-toolpa' });
    setError('');
    try {
      const samples =
        chain.source.type === 'sample' && loaded ? [{ sha256: loaded.sha256, bytes: loaded.bytes }] : [];
      const packed = await packToolpa(
        {
          chain,
          title: chain.source.type,
          name: chain.source.type,
          parents,
          seq: parents.length + 1,
          samples,
        },
        trace,
      );
      const filename = `${packed.name}-${packed.graphHash.slice(0, 12)}.toolpa`;
      const copy = new Uint8Array(packed.bytes.byteLength);
      copy.set(packed.bytes);
      const blob = new Blob([copy], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      trace.event('export.toolpa', {
        hash: packed.graphHash,
        contentId: packed.contentId,
        bytes: packed.bytes.byteLength,
        name: filename,
        ok: true,
      });
      remember();
      setStatus(`Downloaded ${filename}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const code = caught instanceof ArtifactError ? caught.code : 'error';
      trace.event('export.toolpa', { ok: false, code });
      trace.event('error', { code, where: 'export.toolpa', message });
      setError(message);
      setStatus('Download failed.');
      remember();
    }
  }

  async function openToolpa(file: File | undefined) {
    if (!file) return;
    trace.event('ui.action', { action: 'import-toolpa' });
    setError('');
    if (file.size > MAX_SAMPLE_BYTES) {
      trace.event('import.toolpa', { bytes: file.size, rejected: true, ok: false, code: 'LOADER_TOO_LARGE' });
      trace.event('error', { code: 'LOADER_TOO_LARGE', where: 'import.toolpa', message: 'file is larger than 50 MB' });
      setError('LOADER_TOO_LARGE: file is larger than 50 MB');
      setStatus('That file is larger than 50 MB.');
      remember();
      return;
    }
    setStatus(`Opening ${file.name}…`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const unpacked = await unpackToolpa(bytes, trace);
      let sample: LoadedSample | null = null;
      if (unpacked.chain.source.type === 'sample') {
        const sourceSha = unpacked.chain.source.sha256;
        const packedSample = unpacked.samples.find((entry) => entry.sha256 === sourceSha);
        if (!packedSample) throw new ArtifactError('sample', 'The sample blob for this chain is not in the file.');
        const decoded = await decodeSample(packedSample.bytes, trace);
        if (decoded.sha256 !== sourceSha) {
          throw new ArtifactError('ARTIFACT_HASH_MISMATCH', `ARTIFACT_HASH_MISMATCH: samples/${sourceSha}.wav`);
        }
        sample = {
          name: file.name,
          sha256: decoded.sha256,
          sampleRate: decoded.sampleRate,
          pcm: decoded.pcm,
          frames: decoded.frames,
          bytes: packedSample.bytes,
        };
      }
      const sealed = await sealArtifact({ chain: unpacked.chain, parents: unpacked.parents }, trace);
      applyChain(unpacked.chain, sample);
      try {
        const store = storeRef.current;
        if (store) {
          await store.save({ ...sealed, bytes });
          if (sample) await store.saveSample(sample.sha256, sample.bytes);
          setLoadedId(sealed.id);
          setLibrary(await store.list());
        }
        setParents(sealed.artifact.parents);
        trace.event('import.toolpa', {
          hash: unpacked.graphHash,
          contentId: unpacked.contentId,
          bytes: bytes.byteLength,
          ok: true,
        });
        remember();
        setStatus(`Opened ${file.name}`);
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : String(saveError);
        const code = saveError instanceof ArtifactError ? saveError.code : 'error';
        trace.event('import.toolpa', { hash: unpacked.graphHash, bytes: bytes.byteLength, ok: false, code });
        trace.event('error', { code, where: 'import.toolpa', message });
        setParents(sealed.artifact.parents);
        setError(message);
        setStatus(`Opened ${file.name}. It was not saved.`);
        remember();
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const code = caught instanceof ArtifactError ? caught.code : 'error';
      trace.event('import.toolpa', { bytes: file.size, ok: false, code });
      trace.event('error', { code, where: 'import.toolpa', message });
      setError(message);
      setStatus('That .toolpa file could not be opened.');
      remember();
    }
  }

  function onToolpaDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDropping(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.toolpa')) {
      setError('Open a .toolpa file.');
      setStatus('That file is not a .toolpa chain.');
      return;
    }
    void openToolpa(file);
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
        setError('That artifact is not in the library.');
        return;
      }
      const next = sealed.artifact.chain;
      let sample: LoadedSample | null = null;
      if (next.source.type === 'sample') {
        const bytes = await store.loadSample(next.source.sha256);
        if (!bytes) {
          setError('The sample blob for this chain is not in the library.');
        } else {
          const decoded = await decodeSample(bytes, trace);
          sample = {
            name: 'Saved sample',
            sha256: decoded.sha256,
            sampleRate: decoded.sampleRate,
            pcm: decoded.pcm,
            frames: decoded.frames,
            bytes,
          };
        }
      }
      applyChain(next, sample);
      setParents(sealed.artifact.parents);
      setLoadedId(id);
      setStatus(`Loaded ${id.slice(0, 12)}…`);
      remember();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('Load failed.');
    }
  }

  async function compose() {
    trace.event('ui.action', { action: 'compose' });
    const result = await composeStudio(rack, trace);
    setRackStatus('hash' in result ? result.hash : result.error);
    remember();
  }

  function toggleNote(step: number, midi: number) {
    const key = cellKey(step, midi);
    setRoll((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  async function exportStudio(kind: 'midi' | 'sfz' | 'stems' | 'pack') {
    if (exporting) return;
    trace.event('ui.action', { action: `export-${kind}` });
    setExporting(true);
    setError('');
    try {
      const notes = notesFromRoll(roll);
      const text = await describeExport(kind, notes, hash, trace);
      setExportStatus(text);
      remember();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setExportStatus('Export failed.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
      <PromptBar onLoad={loadGeneration} onSave={(item) => void saveGeneration(item)} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Button type="button" variant="outline" onClick={() => void connectMidi()}>
          Use Web MIDI
        </Button>
        <p data-testid="midi-input">{midiLabel}</p>
        <p data-testid="keyboard-note">{keyboardMidi}</p>
      </div>
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
            <Button type="button" onClick={() => void play()} disabled={(!chain && !promptDoc) || playing}>
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
            <Button type="button" variant="outline" onClick={() => void downloadToolpa()} disabled={!chain}>
              Download .toolpa
            </Button>
            <Button type="button" variant="outline" onClick={() => toolpaFileRef.current?.click()}>
              Open .toolpa
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

          <div
            className={`flex flex-col gap-2 rounded-xl border border-dashed p-3 ${dropping ? 'border-primary bg-muted' : 'border-border'}`}
            data-testid="toolpa-drop"
            onDragEnter={(event) => {
              event.preventDefault();
              setDropping(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setDropping(false);
            }}
            onDrop={onToolpaDrop}
          >
            <input
              ref={toolpaFileRef}
              className="sr-only"
              type="file"
              accept=".toolpa,application/zip"
              aria-label="Open .toolpa"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void openToolpa(file);
              }}
            />
            <p className="text-sm text-muted-foreground">Drop a .toolpa file here, or use Open .toolpa.</p>
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

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 md:p-6" aria-label="Studio">
        <h2 className="text-xl font-medium tracking-tight">Devices, rack, and piano roll</h2>
        <div className="flex flex-wrap gap-2" data-testid="device-browser">
          {STUDIO_DEVICES.map((device) => (
            <Button key={device.id} type="button" variant="outline" onClick={() => setRack((current) => [...current, device.id])}>
              {device.role === 'midi' ? 'Add keys' : device.role === 'instrument' ? 'Add voice' : 'Add lowpass'}
            </Button>
          ))}
          <Button type="button" variant="outline" onClick={() => setRack([])}>
            Clear rack
          </Button>
          <Button type="button" onClick={() => void compose()} disabled={rack.length === 0}>
            Compose rack
          </Button>
        </div>
        <p className="font-mono text-xs text-muted-foreground" data-testid="rack-order">
          {rack.join(' ') || 'empty'}
        </p>
        <p className="font-mono text-xs break-all" data-testid="rack-status">
          {rackStatus}
        </p>
        <div className="flex flex-col gap-1" data-testid="piano-roll">
          {ROLL_MIDIS.map((midi) => (
            <div key={midi} className="flex gap-1">
              {ROLL_STEPS.map((step) => {
                const on = roll.includes(cellKey(step, midi));
                return (
                  <button
                    key={cellKey(step, midi)}
                    type="button"
                    aria-label={`note ${step} ${midi}`}
                    aria-pressed={on}
                    className={`h-6 w-6 rounded-sm border ${on ? 'bg-primary' : 'bg-muted'}`}
                    onClick={() => toggleNote(step, midi)}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <p className="text-sm" data-testid="roll-count">
          {notesFromRoll(roll).length} notes
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void exportStudio('midi')} disabled={exporting || notesFromRoll(roll).length === 0}>
            Export MIDI
          </Button>
          <Button type="button" variant="outline" onClick={() => void exportStudio('sfz')} disabled={exporting || hash.length !== 64}>
            Export SFZ
          </Button>
          <Button type="button" variant="outline" onClick={() => void exportStudio('stems')} disabled={exporting}>
            Export stems
          </Button>
          <Button type="button" variant="outline" onClick={() => void exportStudio('pack')} disabled={exporting}>
            Export pack
          </Button>
        </div>
        <p className="font-mono text-xs break-all" data-testid="export-status">
          {exportStatus}
        </p>
      </section>
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
