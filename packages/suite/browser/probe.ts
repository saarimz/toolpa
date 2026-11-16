import { agentSelfCheck } from '@toolpa/agent';
import { smfSelfCheck } from '@toolpa/pack';
import { rackSelfCheck } from '@toolpa/devices';
import { generateSelfCheck } from '@toolpa/generate';
import { midiSelfCheck } from '@toolpa/midi';

const api = {
  midi: () => midiSelfCheck(),
  generate: () => generateSelfCheck(),
  rack: () => rackSelfCheck(),
  agent: () => agentSelfCheck(),
  smf: () => smfSelfCheck(),
};

declare global {
  interface Window {
    __toolpaSuite: typeof api;
  }
}

window.__toolpaSuite = api;
