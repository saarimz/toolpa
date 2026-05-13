<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

- Run alternate dev-server ports as `pnpm dev --port 3010`; `pnpm dev -- --port 3010` is parsed as a project directory.
- If a same-directory Next dev server is already running, Next may refuse a second server even on another port; reuse the logged URL/PID or stop that server first.
<!-- END:nextjs-agent-rules -->
