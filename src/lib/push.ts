import { supabase } from "@/integrations/supabase/client";
import { VAPID_PUBLIC_KEY } from "@/lib/push-config";

export const REMINDER_SNOOZE_KEY = "flockkeeper:reminder-prompt-snoozed";
export const INSTALLED_KEY = "flockkeeper:installed";
export const PUSH_EVENT = "flockkeeper:push-changed";

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
export function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
/** iPhone only allows web push once the app is installed to the home screen. */
export function pushUsableHere() {
  return pushSupported() && (!isIOS() || isStandalone());
}

function keyBytes(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error("Reminders work on the live Flock Keeper site. Please open it there.");
  return reg;
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function enableReminders() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked. Allow them in your browser settings.");
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: user.id,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error && error.code !== "23505") throw error;
  window.dispatchEvent(new Event(PUSH_EVENT));
}

export async function disableReminders() {
  const sub = await currentPushSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => undefined);
  }
  window.dispatchEvent(new Event(PUSH_EVENT));
}
