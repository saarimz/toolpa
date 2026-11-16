import { agentSelfCheck } from '@toolpa/agent';
import { rackSelfCheck } from '@toolpa/devices';
import { generateSelfCheck } from '@toolpa/generate';
import { midiSelfCheck } from '@toolpa/midi';

const api = {
  midi: () => midiSelfCheck(),
  generate: () => generateSelfCheck(),
  rack: () => rackSelfCheck(),
  agent: () => agentSelfCheck(),
};

declare global {
  interface Window {
    __toolpaSuite: typeof api;
  }
}

window.__toolpaSuite = api;
