import { installNetworkGuard } from '@toolpa/trace';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { allowPlaygroundTarget } from './network.ts';
import { ring, trace } from './telemetry.ts';

installNetworkGuard({
  allow: (target) => allowPlaygroundTarget(target, location.href),
  trace,
});

declare global {
  interface Window {
    __toolpaPlayground?: {
      snapshot: () => ReturnType<typeof ring.snapshot>;
    };
  }
}

window.__toolpaPlayground = { snapshot: () => ring.snapshot() };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
