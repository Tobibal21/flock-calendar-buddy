import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAYSTACK_API = "https://api.paystack.co";

function addMonth(from: Date) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/**
 * Reconciliation fallback: verifies a Paystack transaction reference directly
 * and activates the caller's subscription when it succeeded. Used when the
 * webhook is late, missing or misconfigured.
 */
export const paystackVerifyReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { reference: string }) => {
    const ref = typeof data?.reference === "string" ? data.reference.trim() : "";
    if (!ref) throw new Error("A transaction reference is required");
    return { reference: ref.slice(0, 200) };
  })
  .handler(async ({ data, context }) => {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) {
      throw new Error(
        "Payments are not configured yet. Add PAYSTACK_SECRET_KEY and PAYSTACK_PLAN_CODE in project secrets.",
      );
    }

    const res = await fetch(
      `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const body = (await res.json().catch(() => ({}))) as {
      data?: Record<string, any>;
      message?: string;
    };
    if (!res.ok || !body.data) {
      console.error("[paystack-verify] verify failed", body.message);
      throw new Error(body.message ?? "Could not verify the payment. Please try again.");
    }

    const d = body.data;
    const status: string = d.status ?? "unknown";
    if (status !== "success") {
      console.error("[paystack-verify] reference not successful", data.reference, status);
      return { verified: false as const, status };
    }

    const paidAt = d.paid_at ? new Date(d.paid_at) : new Date();
    const patch: Record<string, unknown> = {
      status: "active",
      current_period_end: d.next_payment_date ?? addMonth(paidAt),
    };
    const customerCode = d.customer?.customer_code;
    if (customerCode) patch["paystack_customer_code"] = customerCode;
    const subscriptionCode = d.subscription_code ?? d.plan_object?.subscription_code;
    if (subscriptionCode) patch["paystack_subscription_code"] = subscriptionCode;
    const emailToken = d.email_token ?? d.subscription?.email_token;
    if (emailToken) patch["paystack_email_token"] = emailToken;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("subscribers")
      .update(patch as never)
      .eq("user_id", context.userId);
    if (error) {
      console.error("[paystack-verify] subscriber update failed", error.message);
      throw new Error("Payment verified but activation failed. Please refresh in a moment.");
    }

    return { verified: true as const, status: "active" as const };
  });


/**
 * Starts a Paystack subscription checkout for the signed-in user.
 * Returns the hosted `authorization_url` the browser should be sent to.
 */
export const paystackInitialize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { callbackUrl: string }) => {
    if (!data?.callbackUrl || !/^https?:\/\//.test(data.callbackUrl)) {
      throw new Error("A valid callback URL is required");
    }
    return { callbackUrl: data.callbackUrl.slice(0, 500) };
  })
  .handler(async ({ data, context }) => {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    const plan = process.env["PAYSTACK_PLAN_CODE"];
    if (!secret || !plan) {
      throw new Error(
        "Payments are not configured yet. Add PAYSTACK_SECRET_KEY and PAYSTACK_PLAN_CODE in project secrets.",
      );
    }

    const email = (context.claims as { email?: string }).email;
    if (!email) throw new Error("No email on your account — cannot start checkout.");

    const headers = {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    };

    // Find or create the Paystack customer for this email.
    let customerCode: string | undefined;
    const lookup = await fetch(`${PAYSTACK_API}/customer/${encodeURIComponent(email)}`, { headers });
    if (lookup.ok) {
      const body = (await lookup.json()) as { data?: { customer_code?: string } };
      customerCode = body.data?.customer_code;
    }
    if (!customerCode) {
      const created = await fetch(`${PAYSTACK_API}/customer`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email }),
      });
      const body = (await created.json()) as { data?: { customer_code?: string }; message?: string };
      if (!created.ok) throw new Error(body.message ?? "Could not create Paystack customer");
      customerCode = body.data?.customer_code;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (customerCode) {
      await supabaseAdmin
        .from("subscribers")
        .update({ paystack_customer_code: customerCode })
        .eq("user_id", context.userId);
    }

    const init = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        plan,
        callback_url: data.callbackUrl,
        metadata: { user_id: context.userId },
      }),
    });
    const initBody = (await init.json()) as {
      data?: { authorization_url?: string; reference?: string };
      message?: string;
    };
    if (!init.ok || !initBody.data?.authorization_url) {
      console.error("[paystack] initialize failed", initBody.message);
      throw new Error(initBody.message ?? "Could not start checkout. Please try again.");
    }

    return {
      authorizationUrl: initBody.data.authorization_url,
      reference: initBody.data.reference ?? null,
    };
  });

/** Cancels (disables) the signed-in user's Paystack subscription. */
export const paystackCancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured yet.");

    const { data: row, error } = await context.supabase
      .from("subscribers")
      .select("paystack_subscription_code, paystack_email_token")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (row?.paystack_subscription_code && row.paystack_email_token) {
      const res = await fetch(`${PAYSTACK_API}/subscription/disable`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          code: row.paystack_subscription_code,
          token: row.paystack_email_token,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        console.error("[paystack] disable failed", body.message);
        throw new Error(body.message ?? "Could not cancel with Paystack. Please try again.");
      }
    }

    // Fallback in case the webhook is delayed.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("subscribers")
      .update({ status: "canceled" })
      .eq("user_id", context.userId);

    return { ok: true };
  });
