import type { InstrumentStage } from '@toolpa/agent';

export async function streamInstrument(prompt: string, onStage: (stage: InstrumentStage) => void): Promise<InstrumentStage> {
  const response = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!response.body) throw new Error('The agent returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let last: InstrumentStage | null = null;
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      const stage = JSON.parse(line) as InstrumentStage;
      last = stage;
      onStage(stage);
    }
    if (chunk.done) break;
  }
  if (buffer.trim().length > 0) {
    const stage = JSON.parse(buffer) as InstrumentStage;
    last = stage;
    onStage(stage);
  }
  if (!last) throw new Error('The agent returned an empty response.');
  return last;
}
