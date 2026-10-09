import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
  return { isIOS, isIOSSafari: isIOS && !nonSafari, standalone };
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
          <DialogDescription>It takes less than a minute.</DialogDescription>
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
                <Step n={1}>Tap the Share icon <Share className="inline h-4 w-4" /> at the bottom of the screen.</Step>
                <Step n={2}>Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare className="inline h-4 w-4" />.</Step>
                <Step n={3}>Tap <strong>Add</strong> in the top corner.</Step>
              </ol>
            </div>
          )}
          {!showIOS && (
            <div>
              <p className="mb-2 text-sm font-semibold">Android (Chrome)</p>
              <ol className="space-y-2 text-sm">
                <Step n={1}>Tap the menu button <strong>⋮</strong> at the top right.</Step>
                <Step n={2}>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</Step>
                <Step n={3}>Tap <strong>Install</strong>.</Step>
              </ol>
            </div>
          )}
        </div>
        <Button onClick={() => onOpenChange(false)} className="w-full">Got it</Button>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

export function InstallBanner({ placement, className = "" }: { placement: "landing" | "app"; className?: string }) {
  const key = `flockkeeper:install-dismissed:${placement}`;
  const [visible, setVisible] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    const env = detect();
    if (env.standalone) return;
    const ts = Number(localStorage.getItem(key) || 0);
    if (ts && Date.now() - ts < WEEK) return;
    const update = () => {
      setCanPrompt(!!deferred);
      if (detect().standalone) setVisible(false);
    };
    update();
    // Show on iPhone (manual steps) or once the browser offers install.
    setVisible(env.isIOS || !!deferred);
    const l = () => { update(); if (deferred) setVisible(true); };
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
      setCanPrompt(false);
      if (outcome === "accepted") setVisible(false);
    } else {
      setGuide(true);
    }
  };

  return (
    <>
      {visible && (
        <div className={`flex items-center gap-3 rounded-2xl border border-primary/30 bg-card p-3 shadow-sm ${className}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Download className="h-4 w-4" />
          </span>
          <p className="flex-1 text-sm">Add Flock Keeper to your phone for quick access, even offline.</p>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" onClick={install} data-can-prompt={canPrompt}>Install</Button>
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
