import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enableReminders, pushUsableHere, REMINDER_SNOOZE_KEY, PUSH_EVENT } from "@/lib/push";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** One-time card asking to turn on daily log reminders. Hidden while `blocked` (e.g. install banner showing). */
export function ReminderPrompt({ blocked = false }: { blocked?: boolean }) {
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = () => {
      const snoozed = Number(localStorage.getItem(REMINDER_SNOOZE_KEY) || 0);
      setEligible(pushUsableHere() && Notification.permission === "default" && !(snoozed && Date.now() - snoozed < WEEK));
    };
    check();
    window.addEventListener(PUSH_EVENT, check);
    window.addEventListener("appinstalled", check);
    return () => {
      window.removeEventListener(PUSH_EVENT, check);
      window.removeEventListener("appinstalled", check);
    };
  }, []);

  if (!eligible || blocked) return null;

  const notNow = () => {
    localStorage.setItem(REMINDER_SNOOZE_KEY, String(Date.now()));
    setEligible(false);
  };
  const enable = async () => {
    setBusy(true);
    try {
      await enableReminders();
      toast.success("Reminders are on. We will remind you at 7 AM and 6 PM.");
      setEligible(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not turn on reminders.");
      if (Notification.permission !== "default") setEligible(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-card p-3 shadow-sm">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Bell className="h-4 w-4" />
      </span>
      <p className="flex-1 text-sm">Get daily reminders to log your eggs and expenses?</p>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={enable} disabled={busy}>Enable</Button>
        <Button size="sm" variant="ghost" onClick={notNow} aria-label="Not now">
          <span className="hidden sm:inline">Not now</span>
          <X className="h-4 w-4 sm:hidden" />
        </Button>
      </div>
    </div>
  );
}
