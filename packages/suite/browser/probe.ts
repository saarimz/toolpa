import { midiSelfCheck } from '@toolpa/midi';

const api = {
  midi: () => midiSelfCheck(),
};

declare global {
  interface Window {
    __toolpaSuite: typeof api;
  }
}

window.__toolpaSuite = api;
