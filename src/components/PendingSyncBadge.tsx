import { CloudOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { flushQueue, getQueue, type OutboxTable } from "@/lib/offline-queue";
import { usePendingSync } from "@/hooks/usePendingSync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";

/** Small badge shown on pages that can queue writes while offline. */
export function PendingSyncBadge({ table, className }: { table: OutboxTable; className?: string }) {
  const { pending, failed } = usePendingSync(table);
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  if (pending === 0) return null;

  const sync = async () => {
    if (!online) {
      toast.error("Still offline — entries will sync automatically.");
      return;
    }
    setSyncing(true);
    const res = await flushQueue();
    setSyncing(false);
    if (res.synced > 0) {
      toast.success(`Synced ${res.synced} entries`);
      qc.invalidateQueries();
    }
    if (res.failed > 0) toast.error("Some entries couldn't be saved.");
  };

  const failedNote = failed > 0 ? ` · ${failed} need attention` : "";

  return (
    <button
      type="button"
      onClick={sync}
      title={getQueue().find((i) => i.error)?.error ?? "Waiting to sync"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        failed > 0
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-accent/30 text-muted-foreground",
        className,
      )}
    >
      {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CloudOff className="h-3.5 w-3.5" />}
      {pending} pending sync{failedNote}
    </button>
  );
}
