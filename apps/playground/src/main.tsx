import { installNetworkGuard } from '@toolpa/trace';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ring, trace } from './telemetry.ts';

installNetworkGuard({
  allow: (target) => {
    if (target.startsWith('blob:') || target.startsWith('data:')) return true;
    try {
      return new URL(target, location.href).origin === location.origin;
    } catch {
      return false;
    }
  },
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
