import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { paystackInitialize } from "@/lib/paystack.functions";
import { fetchSubscriber, useSubscription } from "@/hooks/useSubscription";

type Search = { trxref?: string; reference?: string };

export const Route = createFileRoute("/_authenticated/subscribe")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    trxref: typeof search.trxref === "string" ? search.trxref : undefined,
    reference: typeof search.reference === "string" ? search.reference : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Subscribe — Coopkeeper" },
      { name: "description", content: "Subscribe to Coopkeeper to keep tracking your flocks, egg production and farm finances." },
      { property: "og:title", content: "Subscribe — Coopkeeper" },
      { property: "og:description", content: "Keep your poultry farm records, production charts and vaccine reminders running." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SubscribePage,
});

const BENEFITS = [
  "Unlimited flock and bird records",
  "Daily egg production in crates, with weekly, monthly and yearly totals",
  "Income, expenses and profit tracking in Naira",
  "Vaccine schedules with calendar reminders",
  "Offline logging that syncs when you're back online",
];

function SubscribePage() {
  const { trxref, reference } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { subscription, trialDaysLeft, isLoading } = useSubscription();
  const initialize = useServerFn(paystackInitialize);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(Boolean(trxref || reference));

  useEffect(() => {
    if (!trxref && !reference) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 10; i++) {
        const sub = await fetchSubscriber().catch(() => null);
        if (cancelled) return;
        if (sub?.status === "active") {
          qc.invalidateQueries({ queryKey: ["subscription"] });
          toast.success("Subscription active — welcome back!");
          navigate({ to: "/dashboard" });
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (cancelled) return;
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ["subscription"] });
      toast.message("Payment received — activation is taking a moment. Refresh shortly.");
    })();
    return () => { cancelled = true; };
  }, [trxref, reference, navigate, qc]);

  const subscribe = async () => {
    setStarting(true);
    try {
      const res = await initialize({
        data: { callbackUrl: `${window.location.origin}/subscribe` },
      });
      window.location.href = res.authorizationUrl;
    } catch (e: any) {
      setStarting(false);
      toast.error(e?.message ?? "Could not start checkout");
    }
  };

  const status = subscription?.status;
  const headline = confirming
    ? "Confirming payment…"
    : status === "trialing" && trialDaysLeft > 0
      ? `${trialDaysLeft} ${trialDaysLeft === 1 ? "day" : "days"} left in your free trial`
      : status === "past_due"
        ? "Payment failed — subscription inactive"
        : status === "canceled"
          ? "Subscription canceled"
          : status === "active"
            ? "Your subscription is active"
            : "Your free trial has ended";

  return (
    <>
      <PageHeader title="Subscription" subtitle="Keep your farm records running with a monthly plan." />
      <div className="px-6 md:px-10 py-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            {confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">{headline}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {confirming
              ? "We're activating your subscription. This usually takes a few seconds."
              : "Coopkeeper keeps every flock, crate and Naira accounted for — subscribe monthly to keep full access."}
          </p>

          {!confirming && (
            <>
              <ul className="mt-6 space-y-2.5">
                {BENEFITS.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-7 w-full" size="lg" onClick={subscribe} disabled={starting || isLoading || status === "active"}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {status === "active" ? "You're subscribed" : "Subscribe with Paystack"}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Secure payment by Paystack · cancel anytime from your account page
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

