/**
 * Tiny in-process event fan-out for the LAN dashboard. Device API handlers
 * publish after a state change; authenticated dashboards listen over SSE.
 */
export type LiveUpdate = {
  kind: "clock" | "device" | "settings";
  at: string;
};

type Listener = (update: LiveUpdate) => void;

// Keep one registry even when Next loads API routes in different server chunks.
const liveGlobal = globalThis as typeof globalThis & {
  __timetoneLiveListeners?: Set<Listener>;
};
const listeners = liveGlobal.__timetoneLiveListeners ??= new Set<Listener>();

export function publishLiveUpdate(kind: LiveUpdate["kind"]) {
  const update: LiveUpdate = { kind, at: new Date().toISOString() };
  listeners.forEach((listener) => listener(update));
}

export function subscribeToLiveUpdates(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
