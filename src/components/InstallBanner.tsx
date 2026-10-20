import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { INSTALLED_KEY } from "@/lib/push";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Capture the install event as early as possible (it can fire before React mounts).
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* ignore */ }
    listeners.forEach((l) => l());
  });
}

const WEEK = 7 * 24 * 60 * 60 * 1000;

function detect() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const nonSafari = /CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|WhatsApp|Line\//.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone) { try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* ignore */ } }
  return { isIOS, isIOSSafari: isIOS && !nonSafari, standalone };
}

/* Small drawn pictures of the iPhone buttons. */
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
function AddHomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function AddWord() {
  return <span className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">Add</span>;
}

export function InstallGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [env, setEnv] = useState({ isIOS: false, isIOSSafari: false });
  useEffect(() => { if (open) setEnv(detect()); }, [open]);
  const showIOS = env.isIOS;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Flock Keeper to your phone</DialogTitle>
          <DialogDescription>Install the app to get daily reminders and use it offline.</DialogDescription>
        </DialogHeader>
        {showIOS && !env.isIOSSafari && (
          <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
            First, open this page in <strong>Safari</strong>. Copy the link, open Safari, and paste it.
          </p>
        )}
        <div className="space-y-4">
          {(showIOS || !env.isIOS) && (
            <div>
              <p className="mb-2 text-sm font-semibold">iPhone (Safari)</p>
              <ol className="space-y-2 text-sm">
                <Step n={1} pic={<ShareIcon />}>Tap the <strong>Share</strong> button at the bottom of the screen.</Step>
                <Step n={2} pic={<AddHomeIcon />}>Scroll down and tap <strong>Add to Home Screen</strong>.</Step>
                <Step n={3} pic={<AddWord />}>Tap <strong>Add</strong> at the top.</Step>
              </ol>
            </div>
          )}
          {!showIOS && (
            <div>
              <p className="mb-2 text-sm font-semibold">Android (Chrome)</p>
              <ol className="space-y-2 text-sm">
                <Step n={1} pic={<span className="text-xl font-bold text-primary">⋮</span>}>Tap the menu button at the top right.</Step>
                <Step n={2} pic={<Download className="h-6 w-6 text-primary" />}>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</Step>
                <Step n={3} pic={<AddWord />}>Tap <strong>Install</strong>.</Step>
              </ol>
            </div>
          )}
        </div>
        <Button onClick={() => onOpenChange(false)} className="w-full">Got it</Button>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, pic, children }: { n: number; pic: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border p-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted">{pic}</span>
      <span>{children}</span>
    </li>
  );
}

export function InstallBanner({
  placement,
  className = "",
  onVisibleChange,
}: {
  placement: "landing" | "app";
  className?: string;
  onVisibleChange?: (visible: boolean) => void;
}) {
  const key = `flockkeeper:install-dismissed:${placement}`;
  const [visible, setVisible] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => { onVisibleChange?.(visible); }, [visible, onVisibleChange]);

  useEffect(() => {
    const env = detect();
    if (env.standalone || localStorage.getItem(INSTALLED_KEY)) return;
    const ts = Number(localStorage.getItem(key) || 0);
    if (ts && Date.now() - ts < WEEK) return;
    // Show on iPhone (manual steps) or once the browser offers install.
    setVisible(env.isIOS || !!deferred);
    const l = () => {
      if (localStorage.getItem(INSTALLED_KEY) || detect().standalone) setVisible(false);
      else if (deferred) setVisible(true);
    };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [key]);

  const dismiss = () => {
    localStorage.setItem(key, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (deferred) {
      const e = deferred;
      await e.prompt();
      const { outcome } = await e.userChoice.catch(() => ({ outcome: "dismissed" }));
      deferred = null;
      if (outcome === "accepted") {
        localStorage.setItem(INSTALLED_KEY, "1");
        setVisible(false);
      }
    } else {
      setGuide(true);
    }
  };

  return (
    <>
      {visible && (
        <div className={`flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-card p-3 shadow-sm ${className}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Download className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Add Flock Keeper to your phone</p>
            <p className="text-xs text-muted-foreground">Install the app to get daily reminders and use it offline.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" onClick={install}>Install Flock Keeper</Button>
            <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Not now">
              <span className="hidden sm:inline">Not now</span>
              <X className="h-4 w-4 sm:hidden" />
            </Button>
          </div>
        </div>
      )}
      <InstallGuide open={guide} onOpenChange={setGuide} />
    </>
  );
}
