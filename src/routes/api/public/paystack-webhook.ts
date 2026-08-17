/**
 * Paystack webhook endpoint.
 *
 * IMPORTANT — this URL must be registered in the Paystack dashboard under
 * Settings → API Keys & Webhooks → "Webhook URL":
 *   https://project--8cb10527-e469-488e-84ea-54cae55bcbe3.lovable.app/api/public/paystack-webhook
 * (use the `-dev` variant of the host to test against the preview build).
 *
 * Every request is verified with an HMAC SHA512 signature of the raw body using
 * PAYSTACK_SECRET_KEY; unsigned or mismatched requests are rejected with 401.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import type { TablesUpdate } from "@/integrations/supabase/types";

type PaystackEvent = {
  event: string;
  data: Record<string, any>;
};

function addMonth(from: Date) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYSTACK_SECRET_KEY"];
        if (!secret) return new Response("Not configured", { status: 500 });

        const raw = await request.text();
        const signature = request.headers.get("x-paystack-signature") ?? "";
        const expected = createHmac("sha512", secret).update(raw).digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: PaystackEvent;
        try {
          payload = JSON.parse(raw) as PaystackEvent;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const d = payload.data ?? {};
        const customerCode: string | undefined = d.customer?.customer_code;
        const subscriptionCode: string | undefined =
          d.subscription_code ?? d.subscription?.subscription_code;
        const userId: string | undefined = d.metadata?.user_id;

        const target = async () => {
          const q = supabaseAdmin.from("subscribers").select("user_id");
          if (userId) return userId;
          if (subscriptionCode) {
            const { data } = await q.eq("paystack_subscription_code", subscriptionCode).maybeSingle();
            if (data?.user_id) return data.user_id;
          }
          if (customerCode) {
            const { data } = await supabaseAdmin
              .from("subscribers")
              .select("user_id")
              .eq("paystack_customer_code", customerCode)
              .maybeSingle();
            if (data?.user_id) return data.user_id;
          }
          return null;
        };

        const update = async (patch: TablesUpdate<"subscribers">) => {
          const uid = await target();
          if (!uid) {
            console.error("[paystack-webhook] no subscriber match for", payload.event);
            return;
          }
          const { error } = await supabaseAdmin.from("subscribers").update(patch).eq("user_id", uid);
          if (error) console.error("[paystack-webhook] update failed", error.message);
        };

        switch (payload.event) {
          case "subscription.create": {
            await update({
              status: "active",
              paystack_subscription_code: subscriptionCode ?? null,
              paystack_email_token: d.email_token ?? null,
              paystack_customer_code: customerCode ?? null,
              current_period_end: d.next_payment_date ?? null,
            });
            break;
          }
          case "charge.success": {
            const paidAt = d.paid_at ? new Date(d.paid_at) : new Date();
            await update({
              status: "active",
              current_period_end: d.next_payment_date ?? addMonth(paidAt),
            });
            break;
          }
          case "invoice.payment_failed": {
            await update({ status: "past_due" });
            break;
          }
          case "subscription.disable":
          case "subscription.not_renew": {
            await update({ status: "canceled" });
            break;
          }
          default:
            break;
        }

        return new Response("ok");
      },
    },
  },
});
