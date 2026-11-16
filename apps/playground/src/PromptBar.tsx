import type { PromptInstrument } from '@toolpa/agent';
import type { Chain } from '@toolpa/graph';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { streamInstrument } from './prompt-client.ts';
import { trace } from './telemetry.ts';

export interface LoadedGeneration {
  prompt: string;
  provider: 'mock' | 'remote';
  label: string;
  notice: string;
  hash: string;
  document: PromptInstrument;
  dsl: string;
  chain: Chain;
}

const HISTORY_KEY = 'toolpa.prompt-history';

function readHistory(): LoadedGeneration[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LoadedGeneration[];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function PromptBar({ onLoad, onSave }: { onLoad: (item: LoadedGeneration) => void; onSave: (item: LoadedGeneration) => void }) {
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<string[]>([]);
  const [notice, setNotice] = useState('No gateway key is configured. Using the mock model.');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<LoadedGeneration | null>(null);
  const [history, setHistory] = useState<LoadedGeneration[]>([]);

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  function remember(item: LoadedGeneration) {
    const next = [item, ...readHistory().filter((entry) => entry.hash !== item.hash)].slice(0, 8);
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    setHistory(next);
  }

  function apply(item: LoadedGeneration) {
    setCurrent(item);
    setNotice(`${item.label}. ${item.notice}`);
    setError('');
    onLoad(item);
  }

  async function generate() {
    const text = prompt.trim();
    if (!text || running) return;
    trace.event('ui.action', { action: 'generate' });
    setRunning(true);
    setError('');
    setStages([]);
    try {
      const last = await streamInstrument(text, (stage) => {
        if (stage.stage === 'done') return;
        setStages((currentStages) => [...currentStages, `${stage.stage}: ${stage.detail}`]);
        trace.event('agent.stage', { stage: stage.stage, attempt: 'attempt' in stage ? stage.attempt : 0, ok: stage.stage !== 'error' && stage.stage !== 'repair' });
      });
      if (last.stage === 'error') {
        setError(last.detail);
        setNotice(last.detail);
        return;
      }
      if (last.stage !== 'done') {
        setError('The agent did not finish.');
        return;
      }
      const item: LoadedGeneration = {
        prompt: text,
        provider: last.provider,
        label: last.label,
        notice: last.notice,
        hash: last.hash,
        document: last.document,
        dsl: last.dsl,
        chain: last.chain,
      };
      apply(item);
      remember(item);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 md:p-6" aria-label="Prompt">
      <label className="text-sm font-medium" htmlFor="instrument-prompt">
        Describe an instrument or effect…
      </label>
      <textarea
        id="instrument-prompt"
        className="min-h-24 rounded-xl border bg-background px-3 py-2 text-sm"
        placeholder="Describe an instrument or effect…"
        aria-label="Describe an instrument or effect…"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void generate()} disabled={running || prompt.trim().length === 0}>
          {running ? 'Generating…' : 'Generate'}
        </Button>
        <Button type="button" variant="outline" onClick={() => current && onSave(current)} disabled={!current}>
          Save generation
        </Button>
      </div>
      <p className="text-sm" data-testid="agent-provider">
        {notice}
      </p>
      <ol className="flex flex-col gap-1 text-sm text-muted-foreground" data-testid="agent-stages">
        {stages.map((stage, index) => (
          <li key={`${stage}-${index}`}>{stage}</li>
        ))}
      </ol>
      {error ? (
        <p className="text-sm text-destructive" data-testid="agent-error">
          {error}
        </p>
      ) : null}
      <details open={current !== null} data-testid="agent-document">
        <summary className="cursor-pointer text-sm">Generated document</summary>
        <pre className="mt-2 max-h-48 overflow-auto font-mono text-xs" data-testid="agent-json">
          {current ? JSON.stringify(current.document, null, 2) : ''}
        </pre>
        <pre className="mt-2 overflow-auto font-mono text-xs" data-testid="agent-dsl">
          {current?.dsl ?? ''}
        </pre>
      </details>
      <div className="flex flex-wrap gap-2" data-testid="agent-history">
        {history.map((item) => (
          <Button key={item.hash} type="button" variant="outline" onClick={() => apply(item)}>
            {item.prompt}
          </Button>
        ))}
      </div>
    </section>
  );
}
