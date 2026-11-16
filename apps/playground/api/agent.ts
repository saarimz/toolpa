import type { InstrumentStage } from '@toolpa/agent';
import { encodeStages, streamAgent, type AgentEnv } from '../server/agent-handler.ts';

interface NodeResponse {
  status(code: number): NodeResponse;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export default async function handler(req: { method?: string; body?: unknown }, res: NodeResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const stages: InstrumentStage[] = [];
  await streamAgent(req.body ?? {}, process.env as AgentEnv, (stage) => stages.push(stage));
  res.status(200);
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  res.end(encodeStages(stages));
}
