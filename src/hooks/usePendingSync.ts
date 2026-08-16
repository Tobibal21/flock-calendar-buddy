import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { countPending, flushQueue, getQueue, subscribeQueue, type OutboxTable } from "@/lib/offline-queue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Reactive count of queued (not yet synced) entries, optionally per table. */
export function usePendingSync(table?: OutboxTable) {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);

  const read = useCallback(() => {
    setPending(countPending(table));
    setFailed(getQueue().filter((i) => i.error && (!table || i.table === table)).length);
  }, [table]);

  useEffect(() => {
    read();
    return subscribeQueue(read);
  }, [read]);

  return { pending, failed };
}

const INVALIDATE: Record<OutboxTable, string[]> = {
  production_records: ["production", "production-30d", "production-amounts"],
  vaccinations: ["vaccines", "vaccines-upcoming"],
  finance_records: ["finance"],
};

/** Flushes the outbox whenever the connection returns. Mount once. */
export function useAutoSync() {
  const online = useOnlineStatus();
  const qc = useQueryClient();

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      const tables = new Set(getQueue().map((i) => i.table));
      if (tables.size === 0) return;
      const res = await flushQueue();
      if (cancelled) return;
      if (res.synced > 0) {
        toast.success(`Synced ${res.synced} offline ${res.synced === 1 ? "entry" : "entries"}`);
        tables.forEach((t) =>
          INVALIDATE[t].forEach((key) => qc.invalidateQueries({ queryKey: [key] })),
        );
      }
      if (res.failed > 0) {
        toast.error(
          `${res.failed} offline ${res.failed === 1 ? "entry" : "entries"} couldn't be saved — check the pending sync badge.`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, qc]);
}
