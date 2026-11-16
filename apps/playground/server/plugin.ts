import path from 'node:path';
import { loadEnv, type Plugin } from 'vite';

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function agentApi(): Plugin {
  return {
    name: 'toolpa-agent-api',
    async configureServer(server) {
      const handler = (await server.ssrLoadModule(path.resolve(server.config.root, 'server/agent-handler.ts'))) as {
        streamAgent: (body: unknown, env: Record<string, string>, write: (stage: unknown) => void) => Promise<void>;
      };
      server.middlewares.use(async (req, res, next) => {
        const urlPath = req.url?.split('?')[0];
        if (urlPath !== '/api/agent' || req.method !== 'POST') {
          next();
          return;
        }
        try {
          const raw = await readBody(req);
          const body = raw.trim().length > 0 ? (JSON.parse(raw) as unknown) : {};
          const env = loadEnv(server.config.mode, server.config.root, '');
          res.statusCode = 200;
          res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          await handler.streamAgent(body, env, (stage) => {
            res.write(`${JSON.stringify(stage)}\n`);
          });
          res.end();
        } catch {
          if (!res.headersSent) res.statusCode = 500;
          res.end(`${JSON.stringify({ stage: 'error', code: 'error', detail: 'The agent failed.' })}\n`);
        }
      });
    },
  };
}
