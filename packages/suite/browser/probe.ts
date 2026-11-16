import { agentSelfCheck, hostedAgentSelfCheck } from '@toolpa/agent';
import { irSelfCheck } from '@toolpa/ir';
import { smfSelfCheck } from '@toolpa/pack';
import { rackSelfCheck } from '@toolpa/devices';
import { generateSelfCheck, hostedPromptSelfCheck } from '@toolpa/generate';
import { midiSelfCheck, webMidiSelfCheck } from '@toolpa/midi';

const api = {
  midi: () => midiSelfCheck(),
  webmidi: () => webMidiSelfCheck(),
  generate: () => generateSelfCheck(),
  hosted: () => hostedAgentSelfCheck(),
  prompt: () => hostedPromptSelfCheck(),
  rack: () => rackSelfCheck(),
  agent: () => agentSelfCheck(),
  ir: () => irSelfCheck(),
  smf: () => smfSelfCheck(),
};

declare global {
  interface Window {
    __toolpaSuite: typeof api;
  }
}

window.__toolpaSuite = api;
