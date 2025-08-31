export type Snapshot<S> = {
  version: number;
  state: S;
  timestamp: string;
};

type Store<S> = Map<string, Snapshot<S>[]>;

// Keep a single instance during dev/hot-reload.
const g = globalThis as any;
if (!g.__ROLLBACK_STORE__) g.__ROLLBACK_STORE__ = new Map();
export const rollbackStore = g.__ROLLBACK_STORE__ as Store<any>;

export function latestSnapshot<S = any>(threadId: string): Snapshot<S> | null {
  const arr = rollbackStore.get(threadId);
  return arr && arr.length ? (arr[arr.length - 1] as Snapshot<S>) : null;
}

export function saveSnapshot<S = any>(threadId: string, state: S): Snapshot<S> {
  const arr = rollbackStore.get(threadId) ?? [];
  const nextVersion = arr.length ? arr[arr.length! - 1]!.version + 1 : 1;
  const snap: Snapshot<S> = {
    version: nextVersion,
    state,
    timestamp: new Date().toISOString(),
  };
  arr.push(snap);
  rollbackStore.set(threadId, arr);
  return snap;
}

export function rollbackTo<S = any>(
  threadId: string,
  version: number,
): Snapshot<S> | null {
  const arr = rollbackStore.get(threadId);
  if (!arr || !arr.length) return null;
  const idx = arr.findIndex((s) => s.version === version);
  if (idx === -1) return null;
  const truncated = arr.slice(0, idx + 1);
  rollbackStore.set(threadId, truncated);
  return truncated[truncated.length - 1] as Snapshot<S>;
}
