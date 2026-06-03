import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Bird, Egg, Syringe, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: flocks } = useQuery({
    queryKey: ["flocks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("flocks").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: production } = useQuery({
    queryKey: ["production-30d"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("production_records")
        .select("*")
        .gte("record_date", since)
        .order("record_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: upcomingVacc } = useQuery({
    queryKey: ["vaccines-upcoming"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("vaccinations")
        .select("*, flocks(name)")
        .eq("administered", false)
        .gte("scheduled_date", today)
        .order("scheduled_date", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const totalBirds = flocks?.reduce((s, f) => s + (f.current_count ?? 0), 0) ?? 0;
  const totalFlocks = flocks?.length ?? 0;

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      map.set(d, 0);
    }
    production?.forEach((r) => {
      map.set(r.record_date, (map.get(r.record_date) ?? 0) + (r.eggs_collected ?? 0));
    });
    return Array.from(map.entries()).map(([date, eggs]) => ({
      date: date.slice(5),
      eggs,
    }));
  }, [production]);

  const totalEggs30d = chartData.reduce((s, d) => s + d.eggs, 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayEggs = production?.filter((r) => r.record_date === today).reduce((s, r) => s + r.eggs_collected, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="A snapshot of your farm today."
        actions={
          <Link to="/production">
            <Button>Log today's eggs</Button>
          </Link>
        }
      />

      <div className="px-6 md:px-10 py-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Bird} label="Birds" value={totalBirds.toLocaleString()} hint={`${totalFlocks} flock${totalFlocks === 1 ? "" : "s"}`} />
          <Stat icon={Egg} label="Crates today" value={todayEggs.toLocaleString()} />
          <Stat icon={TrendingUp} label="Crates (30 days)" value={totalEggs30d.toLocaleString()} />
          <Stat icon={Syringe} label="Upcoming vaccines" value={(upcomingVacc?.length ?? 0).toString()} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="font-semibold">Crate production trend</h2>
              <p className="text-sm text-muted-foreground">Last 30 days</p>
            </div>
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="eggGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="eggs" stroke="var(--color-primary)" strokeWidth={2} fill="url(#eggGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Upcoming vaccinations</h2>
            <Link to="/vaccines"><Button variant="ghost" size="sm">View all</Button></Link>
          </div>
          <div className="mt-4 divide-y divide-border">
            {upcomingVacc && upcomingVacc.length > 0 ? upcomingVacc.map((v) => (
              <div key={v.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{v.vaccine_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(v as any).flocks?.name ?? "All flocks"} · {new Date(v.scheduled_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground py-3">No upcoming vaccines. <Link to="/vaccines" className="text-primary hover:underline">Schedule one</Link>.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
