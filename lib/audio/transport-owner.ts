"use client";

const activeEngineIds = new Set<string>();

export type TransportRegistrationResult = "first" | "joining";
export type TransportUnregistrationResult = "last" | "remaining" | "absent";

export function registerActiveEngine(engineId: string): TransportRegistrationResult {
  const wasEmpty = activeEngineIds.size === 0;
  activeEngineIds.add(engineId);
  return wasEmpty ? "first" : "joining";
}

export function unregisterActiveEngine(engineId: string): TransportUnregistrationResult {
  if (!activeEngineIds.has(engineId)) {
    return "absent";
  }
  activeEngineIds.delete(engineId);
  return activeEngineIds.size === 0 ? "last" : "remaining";
}

export function isActiveEngine(engineId: string): boolean {
  return activeEngineIds.has(engineId);
}

export function getActiveEngineCount(): number {
  return activeEngineIds.size;
}

export function resetTransportOwnership(): void {
  activeEngineIds.clear();
}
