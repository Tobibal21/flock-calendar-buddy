import { supabase } from "@/integrations/supabase/client";

export type OutboxTable = "production_records" | "vaccinations" | "finance_records";

export type OutboxItem = {
  id: string;
  table: OutboxTable;
  payload: Record<string, any>;
  createdAt: number;
  /** Set when a flush attempt failed for a non-network reason (needs user attention). */
  error?: string;
};

const KEY = "coopkeeper.outbox.v1";
const EVENT = "coopkeeper:outbox";

const isBrowser = () => typeof window !== "undefined";

export function getQueue(): OutboxItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function setQueue(items: OutboxItem[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full / unavailable — keep in-memory behaviour graceful */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeQueue(cb: () => void) {
  if (!isBrowser()) return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function enqueue(table: OutboxTable, payload: Record<string, any>): OutboxItem {
  const item: OutboxItem = {
    id:
      isBrowser() && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    table,
    payload,
    createdAt: Date.now(),
  };
  setQueue([...getQueue(), item]);
  return item;
}

export function removeFromQueue(id: string) {
  setQueue(getQueue().filter((i) => i.id !== id));
}

export function countPending(table?: OutboxTable) {
  const q = getQueue();
  return table ? q.filter((i) => i.table === table).length : q.length;
}

/** True when the failure is a connectivity problem (safe to retry later). */
function isNetworkError(e: any) {
  if (!isBrowser()) return false;
  if (!navigator.onLine) return true;
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    msg.includes("timeout")
  );
}

let flushing = false;

export type FlushResult = { synced: number; failed: number; remaining: number };

/**
 * Push queued rows to the backend. Network failures leave items queued;
 * real errors (validation/auth) mark the item so the user can act on it
 * without blocking the rest of the queue.
 */
export async function flushQueue(): Promise<FlushResult> {
  if (!isBrowser() || flushing) return { synced: 0, failed: 0, remaining: countPending() };
  const items = getQueue();
  if (items.length === 0) return { synced: 0, failed: 0, remaining: 0 };

  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { synced: 0, failed: 0, remaining: items.length };

    for (const item of items) {
      if (item.error) continue; // needs attention; skip but keep
      try {
        const { error } = await supabase
          .from(item.table)
          .insert({ ...item.payload, user_id: user.id } as never);
        if (error) throw error;
        removeFromQueue(item.id);
        synced++;
      } catch (e: any) {
        if (isNetworkError(e)) break; // still offline — stop, keep everything queued
        failed++;
        setQueue(
          getQueue().map((i) =>
            i.id === item.id ? { ...i, error: e?.message ?? "Sync failed" } : i,
          ),
        );
      }
    }
  } finally {
    flushing = false;
  }

  return { synced, failed, remaining: countPending() };
}

/** Drop an entry that permanently failed (user acknowledged). */
export function discardFailed(id: string) {
  removeFromQueue(id);
}
