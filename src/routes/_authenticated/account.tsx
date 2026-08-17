import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { paystackCancel } from "@/lib/paystack.functions";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account & Subscription — Coopkeeper" },
      { name: "description", content: "View your Coopkeeper subscription status, renewal date and manage cancellation." },
      { property: "og:title", content: "Account & Subscription — Coopkeeper" },
      { property: "og:description", content: "Manage your Coopkeeper poultry farm subscription." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountPage,
});

const STATUS_LABEL: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  canceled: "Canceled",
};

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AccountPage() {
  const qc = useQueryClient();
  const { subscription, trialDaysLeft, isLoading } = useSubscription();
  const cancelFn = useServerFn(paystackCancel);
  const [confirm, setConfirm] = useState(false);

  const cancel = useMutation({
    mutationFn: async () => cancelFn({}),
    onSuccess: () => {
      setConfirm(false);
      toast.success("Subscription canceled");
      qc.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not cancel subscription"),
  });

  const status = subscription?.status ?? "trialing";
  const active = status === "active";

  return (
    <>
      <PageHeader title="Account" subtitle="Your Coopkeeper subscription and billing." />
      <div className="px-6 md:px-10 py-6">
        <div className="max-w-xl rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Subscription</h2>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                active || status === "trialing"
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {isLoading ? "…" : STATUS_LABEL[status] ?? status}
            </span>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            {status === "trialing" && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Trial ends</dt>
                <dd className="font-medium">
                  {fmt(subscription?.trial_ends_at ?? null)}
                  {trialDaysLeft > 0 && ` · ${trialDaysLeft} ${trialDaysLeft === 1 ? "day" : "days"} left`}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{active ? "Renews on" : "Paid through"}</dt>
              <dd className="font-medium">{fmt(subscription?.current_period_end ?? null)}</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            {!active && (
              <Button asChild>
                <Link to="/subscribe"><CreditCard className="h-4 w-4" /> Subscribe</Link>
              </Button>
            )}
            {active && (
              <Button variant="outline" onClick={() => setConfirm(true)} disabled={cancel.isPending}>
                {cancel.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Cancel subscription
              </Button>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll keep access until the end of the current billing period. Your records stay saved, but
              you'll need to subscribe again to keep using the app afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep subscription</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancel.mutate()}>Yes, cancel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
