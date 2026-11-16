import { generateSelfCheck } from '@toolpa/generate';
import { midiSelfCheck } from '@toolpa/midi';

const api = {
  midi: () => midiSelfCheck(),
  generate: () => generateSelfCheck(),
};

declare global {
  interface Window {
    __toolpaSuite: typeof api;
  }
}

window.__toolpaSuite = api;
