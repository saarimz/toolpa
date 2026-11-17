export {
  GenerateError,
  LocalPromptProvider,
  RemotePromptProvider,
  euclidean,
  generateSelfCheck,
  hostedPromptSelfCheck,
  notesFromHosted,
  notesFromPulses,
  notesFromTokens,
  schedulePattern,
} from './generate.ts';
export type { PatternNote, PromptGenerator } from './generate.ts';
export { clipDocument, launchClip } from './clip.ts';
