import { rackSelfCheck } from '@toolpa/devices';
import { generateSelfCheck } from '@toolpa/generate';
import { midiSelfCheck } from '@toolpa/midi';

const api = {
  midi: () => midiSelfCheck(),
  generate: () => generateSelfCheck(),
  rack: () => rackSelfCheck(),
};

declare global {
  interface Window {
    __toolpaSuite: typeof api;
  }
}

window.__toolpaSuite = api;
