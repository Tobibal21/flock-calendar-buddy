import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { currentPushSubscription, disableReminders, enableReminders, isIOS, isStandalone, pushSupported, PUSH_EVENT } from "@/lib/push";
import { sendTestReminder } from "@/lib/push.functions";

export function ReminderSettings() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const sendTest = useServerFn(sendTestReminder);

  useEffect(() => {
    const load = async () => {
      if (!pushSupported()) return setNote("This browser cannot show reminders.");
      if (isIOS() && !isStandalone()) return setNote("On iPhone, add Flock Keeper to your Home Screen first, then open it from there.");
      if (Notification.permission === "denied") setNote("Notifications are blocked. Allow them in your browser settings.");
      setOn(!!(await currentPushSubscription()));
    };
    load();
    window.addEventListener(PUSH_EVENT, load);
    return () => window.removeEventListener(PUSH_EVENT, load);
  }, []);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) await enableReminders(); else await disableReminders();
      setOn(next);
      toast.success(next ? "Reminders are on." : "Reminders are off.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = await sendTest({});
      if (r.delivered) toast.success("Test reminder sent. Check your notifications.");
      else toast.error("No device received it. Turn reminders off and on again.");
    } catch {
      toast.error("Could not send the test reminder.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Daily reminders</h2>
          <p className="text-sm text-muted-foreground">7:00 AM and 6:00 PM, to log your eggs and expenses.</p>
        </div>
        <Switch checked={on} onCheckedChange={toggle} disabled={busy || (!!note && !on)} aria-label="Daily reminders" />
      </div>
      {note && <p className="mt-3 text-sm text-muted-foreground">{note}</p>}
      {on && (
        <Button variant="outline" size="sm" className="mt-4" onClick={test} disabled={busy}>
          Send me a test reminder
        </Button>
      )}
    </div>
  );
}
