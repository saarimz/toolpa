import { agentSelfCheck, gatewaySelfCheck, hostedAgentSelfCheck } from '@toolpa/agent';
import { authorSelfCheck, irSelfCheck } from '@toolpa/ir';
import { smfSelfCheck } from '@toolpa/pack';
import { rackSelfCheck } from '@toolpa/devices';
import { generateSelfCheck, hostedPromptSelfCheck } from '@toolpa/generate';
import { midiSelfCheck, webMidiSelfCheck } from '@toolpa/midi';

const api = {
  midi: () => midiSelfCheck(),
  webmidi: () => webMidiSelfCheck(),
  generate: () => generateSelfCheck(),
  hosted: () => hostedAgentSelfCheck(),
  gateway: () => gatewaySelfCheck(),
  prompt: () => hostedPromptSelfCheck(),
  rack: () => rackSelfCheck(),
  agent: () => agentSelfCheck(),
  ir: () => irSelfCheck(),
  author: () => authorSelfCheck(),
  smf: () => smfSelfCheck(),
};

declare global {
  interface Window {
    __toolpaSuite: typeof api;
  }
}

window.__toolpaSuite = api;
