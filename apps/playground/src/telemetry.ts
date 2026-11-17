import { MemoryRing, createTrace } from '@toolpa/trace';

export const ring = new MemoryRing(256);
export const { trace } = createTrace({ ring });
