import { AGENT_STREAM_HEADERS, agentStatus, encodeStages, streamAgent, type AgentEnv, type AgentLog, type InstrumentStage } from '../server/agent-handler.ts';

interface NodeResponse {
  status(code: number): NodeResponse;
  setHeader(name: string, value: string): void;
  write?(chunk: string): void;
  flush?(): void;
  end(body?: string): void;
}

function logLine(entry: AgentLog): void {
  const model = entry.model || '-';
  if (entry.event === 'request') {
    console.info(`[toolpa] POST /api/agent provider=${entry.provider} model=${model} promptChars=${entry.promptChars ?? 0}`);
    return;
  }
  if (entry.event === 'upstream') {
    console.info(`[toolpa] upstream status=${entry.status ?? 0} provider=${entry.provider} model=${model}`);
    return;
  }
  console.info(`[toolpa] stage=${entry.stage ?? '-'} provider=${entry.provider} model=${model}`);
}

export default async function handler(req: { method?: string; url?: string; body?: unknown }, res: NodeResponse): Promise<void> {
  const path = req.url?.split('?')[0] ?? '';
  if (req.method === 'GET' && path.endsWith('/api/agent/status')) {
    const status = agentStatus(process.env as AgentEnv);
    console.info(`[toolpa] GET /api/agent/status provider=${status.provider} model=${status.model || '-'} configured=${status.configured}`);
    res.status(200);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-cache');
    res.end(JSON.stringify(status));
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const stages: InstrumentStage[] = [];
  await streamAgent(req.body ?? {}, process.env as AgentEnv, (stage) => stages.push(stage), undefined, { log: logLine });
  res.status(200);
  for (const [name, value] of Object.entries(AGENT_STREAM_HEADERS)) res.setHeader(name, value);
  res.end(encodeStages(stages));
}
