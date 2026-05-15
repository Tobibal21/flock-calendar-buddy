import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Egg, LayoutDashboard, Bird, ClipboardList, Syringe, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthenticatedLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/flocks", label: "Flocks", icon: Bird },
  { to: "/production", label: "Production", icon: ClipboardList },
  { to: "/vaccines", label: "Vaccines", icon: Syringe },
] as const;

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background">
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
      <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-4 border-t border-border bg-sidebar md:hidden">
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
