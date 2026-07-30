import type { Delivery } from "./types";

/**
 * Offline-first scoring. Every ball is written to IndexedDB first and only then
 * pushed to Supabase, so a scorer standing at the boundary with no signal never
 * loses a delivery.
 */
export type QueuedOp =
  | { id: string; kind: "insert"; at: number; row: Partial<Delivery> }
  | { id: string; kind: "update"; at: number; rowId: string; patch: Partial<Delivery> }
  | { id: string; kind: "delete"; at: number; rowId: string };

const DB_NAME = "wicketwise";
const STORE = "delivery_queue";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("No IndexedDB"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE))
          req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
};

const listeners = new Set<() => void>();
export const onQueueChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const notify = () => listeners.forEach((l) => l());

export async function enqueue(op: QueuedOp) {
  try {
    await tx("readwrite", (s) => s.put(op));
  } catch {
    memory.push(op);
  }
  notify();
}

export async function pending(): Promise<QueuedOp[]> {
  try {
    const rows = await tx<QueuedOp[]>("readonly", (s) => s.getAll());
    return [...rows, ...memory].sort((a, b) => a.at - b.at);
  } catch {
    return [...memory].sort((a, b) => a.at - b.at);
  }
}

export async function dequeue(id: string) {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* ignore */
  }
  const i = memory.findIndex((o) => o.id === id);
  if (i >= 0) memory.splice(i, 1);
  notify();
}

/** Fallback for private-mode browsers where IndexedDB throws. */
const memory: QueuedOp[] = [];

export const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);

/** Drains the queue in recording order; stops at the first failure and retries later. */
export async function flushQueue(apply: (op: QueuedOp) => Promise<void>) {
  if (!isOnline()) return { sent: 0, remaining: (await pending()).length };
  let sent = 0;
  for (const op of await pending()) {
    try {
      await apply(op);
      await dequeue(op.id);
      sent += 1;
    } catch {
      break;
    }
  }
  return { sent, remaining: (await pending()).length };
}
