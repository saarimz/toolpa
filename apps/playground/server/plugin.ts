import path from 'node:path';
import { loadEnv, type Plugin } from 'vite';

interface AgentStatus {
  provider: string;
  label: string;
  model: string;
  configured: boolean;
  notice: string;
}

interface AgentLog {
  event: 'request' | 'stage' | 'upstream';
  provider: string;
  model: string;
  stage?: string;
  status?: number;
  promptChars?: number;
  finishReason?: string;
  contentLength?: number;
}

interface InstrumentStage {
  stage: string;
  code?: string;
  detail?: string;
}

type HandlerModule = {
  AGENT_STREAM_HEADERS: Record<string, string>;
  agentStatus: (env: Record<string, string>) => AgentStatus;
  streamAgent: (
    body: unknown,
    env: Record<string, string>,
    write: (stage: InstrumentStage) => void,
    transport: undefined,
    options: { log: (entry: AgentLog) => void },
  ) => Promise<void>;
  writeStage: (res: { write(chunk: string): unknown; flush?: () => void }, stage: InstrumentStage) => void;
};

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function logLine(entry: AgentLog): void {
  const model = entry.model || '-';
  if (entry.event === 'request') {
    console.info(`[toolpa] POST /api/agent provider=${entry.provider} model=${model} promptChars=${entry.promptChars ?? 0}`);
    return;
  }
  if (entry.event === 'upstream') {
    console.info(`[toolpa] upstream status=${entry.status ?? 0} finish_reason=${entry.finishReason ?? 'unknown'} contentLength=${entry.contentLength ?? 0} provider=${entry.provider} model=${model}`);
    return;
  }
  console.info(`[toolpa] stage=${entry.stage ?? '-'} provider=${entry.provider} model=${model}`);
}

export function agentApi(): Plugin {
  return {
    name: 'toolpa-agent-api',
    async configureServer(server) {
      const handler = (await server.ssrLoadModule(path.resolve(server.config.root, 'server/agent-handler.ts'))) as HandlerModule;
      server.middlewares.use(async (req, res, next) => {
        const urlPath = req.url?.split('?')[0];
        const env = loadEnv(server.config.mode, server.config.root, '');
        if (urlPath === '/api/agent/status' && req.method === 'GET') {
          const status = handler.agentStatus(env);
          console.info(`[toolpa] GET /api/agent/status provider=${status.provider} model=${status.model || '-'} configured=${status.configured}`);
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-cache');
          res.end(JSON.stringify(status));
          return;
        }
        if (urlPath !== '/api/agent' || req.method !== 'POST') {
          next();
          return;
        }
        try {
          const raw = await readBody(req);
          const body = raw.trim().length > 0 ? (JSON.parse(raw) as unknown) : {};
          res.statusCode = 200;
          for (const [name, value] of Object.entries(handler.AGENT_STREAM_HEADERS)) res.setHeader(name, value);
          res.flushHeaders?.();
          const socket = (res as { socket?: { setNoDelay?: (noDelay: boolean) => void } }).socket;
          socket?.setNoDelay?.(true);
          await handler.streamAgent(body, env, (stage) => {
            handler.writeStage(res, stage);
          }, undefined, { log: logLine });
          res.end();
        } catch {
          if (!res.headersSent) {
            res.statusCode = 500;
            for (const [name, value] of Object.entries(handler.AGENT_STREAM_HEADERS)) res.setHeader(name, value);
          }
          handler.writeStage(res, { stage: 'error', code: 'error', detail: 'The agent failed.' });
          res.end();
        }
      });
    },
  };
}
