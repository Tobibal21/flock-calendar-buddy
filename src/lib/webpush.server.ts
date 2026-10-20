/**
 * Minimal Web Push sender (VAPID + aes128gcm, RFC 8291/8292) built on Web Crypto,
 * so it runs on the edge worker runtime without Node-only packages.
 */
import { VAPID_PUBLIC_KEY } from "@/lib/push-config";

const enc = new TextEncoder();

function b64uToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function bytesToB64u(b: Uint8Array): string {
  let s = "";
  b.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

async function vapidAuth(endpoint: string, privateKey: string, subject: string) {
  const pub = b64uToBytes(VAPID_PUBLIC_KEY);
  const jwk: JsonWebKey = {
    kty: "EC", crv: "P-256", d: privateKey,
    x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64u(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })));
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${bytesToB64u(sig)}, k=${VAPID_PUBLIC_KEY}`;
}

async function encrypt(payload: string, p256dh: string, authSecret: string) {
  const clientPub = b64uToBytes(p256dh);
  const auth = b64uToBytes(authSecret);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const localPub = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const clientKey = await crypto.subtle.importKey("raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), clientPub, localPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([localPub.length]), localPub, cipher);
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** Returns the push service HTTP status (201 = delivered to push service). */
export async function sendWebPush(target: PushTarget, payload: object): Promise<number> {
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!privateKey) throw new Error("VAPID_PRIVATE_KEY is not set");
  const body = await encrypt(JSON.stringify(payload), target.p256dh, target.auth);
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(target.endpoint, privateKey, "https://flock-calendar-buddy.lovable.app"),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(6 * 3600),
      Urgency: "normal",
    },
    body,
  });
  return res.status;
}

export const REMINDER_COPY = {
  morning: {
    title: "Flock Keeper",
    body: "Good morning! Take a minute to log yesterday's eggs and expenses, and check if any vaccines are due.",
  },
  evening: {
    title: "Flock Keeper",
    body: "You have not logged anything today. Tap to add today's eggs and expenses in under a minute.",
  },
  test: {
    title: "Flock Keeper",
    body: "Test reminder. Your daily reminders are working.",
  },
} as const;

export type Slot = keyof typeof REMINDER_COPY;

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Sends one slot's reminder to every device of a user. Removes dead subscriptions (404/410). */
export async function sendToUser(admin: Admin, userId: string, slot: Slot) {
  const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
  let delivered = 0, removed = 0, failed = 0;
  for (const s of subs ?? []) {
    try {
      const status = await sendWebPush(s, { ...REMINDER_COPY[slot], url: "/production", tag: `reminder-${slot}` });
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", s.id);
        removed++;
      } else if (status >= 200 && status < 300) {
        await admin.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", s.id);
        delivered++;
      } else failed++;
    } catch {
      failed++;
    }
  }
  const result = delivered > 0 ? `sent:${delivered}` : removed > 0 && failed === 0 ? "expired" : failed > 0 ? `failed:${failed}` : "no_devices";
  return { delivered, removed, failed, result };
}
