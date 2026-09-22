import { useEffect } from "react";

/**
 * Registers the app-shell service worker on the real site only.
 * Dev and Lovable preview hosts are skipped (and any stale worker there is
 * removed) so editing never serves cached HTML.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const host = window.location.hostname;
    const isPreviewOrDev =
      import.meta.env.DEV ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("id-preview--") ||
      host.endsWith("-dev.lovable.app") ||
      host.endsWith(".lovableproject.com");

    if (isPreviewOrDev) {
      navigator.serviceWorker.getRegistrations?.().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
