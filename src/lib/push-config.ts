// Public VAPID key (safe to ship to the browser). The private half is the VAPID_PRIVATE_KEY secret.
export const VAPID_PUBLIC_KEY =
  "BJNbiEhsGOLJRBjdDX7qnLb6a5EO1FI9oLR9LK3K5qarP08zr9D9pkOGDRE4TWYdmOTs4_Qql9rbslIQ22DDdYw";

/** Hour (0-23) in Africa/Lagos (UTC+1, no daylight saving). */
export function lagosHour(now = new Date()): number {
  return (now.getUTCHours() + 1) % 24;
}

/** Each slot is only accepted inside its window, so replayed calls can't send at odd hours. */
export function slotAllowedNow(slot: "morning" | "evening", now = new Date()): boolean {
  const h = lagosHour(now);
  return slot === "morning" ? h >= 6 && h < 11 : h >= 17 && h < 22;
}
