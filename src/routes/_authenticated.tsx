import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Egg, LayoutDashboard, Bird, ClipboardList, Syringe, Wallet, LogOut, CloudOff, Cloud, UserCog, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAutoSync, usePendingSync } from "@/hooks/usePendingSync";
import { fetchSubscriber, hasAccess, useSubscription } from "@/hooks/useSubscription";


export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
    // Subscription gate — /subscribe and /account stay reachable so users can pay or sign out.
    if (location.pathname.startsWith("/subscribe") || location.pathname.startsWith("/account")) return;
    const sub = await fetchSubscriber().catch(() => null);
    if (!hasAccess(sub)) {
      throw redirect({ to: "/subscribe" });
    }
  },
  component: AuthenticatedLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/flocks", label: "Flocks", icon: Bird },
  { to: "/production", label: "Production", icon: ClipboardList },
  { to: "/finance", label: "Finance", icon: Wallet },
  { to: "/vaccines", label: "Vaccines", icon: Syringe },
] as const;


function AuthenticatedLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const online = useOnlineStatus();
  const { pending } = usePendingSync();
  useAutoSync();
  const { subscription, trialDaysLeft } = useSubscription();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const showPill = !online || pending > 0;
  const showTrialPill =
    !showPill &&
    subscription?.status === "trialing" &&
    trialDaysLeft <= 2 &&
    !pathname.startsWith("/subscribe");

  return (
    <div className="min-h-screen bg-background">
      {showPill && (
        <div
          className={cn(
            "fixed left-1/2 top-3 z-30 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-sm",
            online
              ? "border-border bg-card text-muted-foreground"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {online ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
          {online
            ? `Syncing ${pending} offline ${pending === 1 ? "entry" : "entries"}…`
            : pending > 0
              ? `Offline · ${pending} saved locally`
              : "Offline · entries save locally"}
        </div>
      )}
      {showTrialPill && (
        <Link
          to="/subscribe"
          className="fixed left-1/2 top-3 z-30 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary shadow-sm"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {trialDaysLeft <= 0
            ? "Trial ended — Subscribe"
            : `Trial ends in ${trialDaysLeft} ${trialDaysLeft === 1 ? "day" : "days"} — Subscribe`}
        </Link>
      )}

      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-sidebar px-4 py-5 md:flex md:flex-col">
        <Link to="/dashboard" className="flex items-center gap-2 px-2 font-semibold tracking-tight">

          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Egg className="h-4 w-4" />
          </span>
          Coopkeeper
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-5 border-t border-border bg-sidebar md:hidden">
        {nav.map((item) => {
          const active = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[11px]",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <main className="md:pl-60 pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
