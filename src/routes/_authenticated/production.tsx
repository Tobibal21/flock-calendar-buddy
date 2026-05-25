import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Egg, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/production")({
  component: ProductionPage,
});

function ProductionPage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const { data: flocks } = useQuery({
    queryKey: ["flocks"],
    queryFn: async () => (await supabase.from("flocks").select("id,name")).data ?? [],
  });

  const { data: records } = useQuery({
    queryKey: ["production"],
    queryFn: async () => {
      const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("production_records")
        .select("*, flocks(name)")
        .gte("record_date", since)
        .order("record_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totals = useMemo(() => {
    const now = new Date();
    
    // Start of current week (Monday)
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Start of current year
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let weekProd = 0, monthProd = 0, yearProd = 0;
    let weekSold = 0, monthSold = 0, yearSold = 0;
    let weekRev = 0, monthRev = 0, yearRev = 0;

    records?.forEach((r) => {
      const rDate = new Date(r.record_date);
      rDate.setHours(12, 0, 0, 0); // avoid timezone shifts
      
      const prod = r.crates_collected ?? 0;
      const sold = r.crates_sold ?? 0;
      const amt = Number(r.amount_sold ?? 0);

      if (rDate >= startOfWeek) {
        weekProd += prod;
        weekSold += sold;
        weekRev += amt;
      }
      if (rDate >= startOfMonth) {
        monthProd += prod;
        monthSold += sold;
        monthRev += amt;
      }
      if (rDate >= startOfYear) {
        yearProd += prod;
        yearSold += sold;
        yearRev += amt;
      }
    });

    return {
      week: { production: weekProd, sold: weekSold, revenue: weekRev },
      month: { production: monthProd, sold: monthSold, revenue: monthRev },
      year: { production: yearProd, sold: yearSold, revenue: yearRev },
    };
  }, [records]);

  const addRecord = useMutation({
    mutationFn: async (payload: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("production_records").insert({ ...payload, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Logged");
      qc.invalidateQueries({ queryKey: ["production"] });
      qc.invalidateQueries({ queryKey: ["production-30d"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRecord = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("production_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production"] });
      qc.invalidateQueries({ queryKey: ["production-30d"] });
    },
  });

  return (
    <>
      <PageHeader title="Daily production" subtitle="Log crates collected each day, per flock." />

      <div className="px-6 md:px-10 py-6 space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Egg className="h-4 w-4 text-primary" /> Quick log
          </div>
          <form
            className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const flockId = fd.get("flock_id") as string;
              addRecord.mutate({
                flock_id: flockId === "all" ? null : flockId,
                record_date: fd.get("record_date"),
                crates_collected: Number(fd.get("crates_collected") ?? 0),
                broken_crates: Number(fd.get("broken_crates") ?? 0),
                feed_kg: Number(fd.get("feed_kg") ?? 0),
                crates_sold: Number(fd.get("crates_sold") ?? 0),
                amount_sold: Number(fd.get("amount_sold") ?? 0),
              });
              (e.target as HTMLFormElement).reset();
              setDate(today);
            }}
          >
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" name="record_date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Flock</Label>
              <Select name="flock_id" defaultValue="all">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All flocks</SelectItem>
                  {flocks?.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Crates collected</Label>
              <Input type="number" name="crates_collected" min={0} required defaultValue="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Broken crates</Label>
              <Input type="number" name="broken_crates" min={0} defaultValue="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Feed (kg)</Label>
              <Input type="number" name="feed_kg" min={0} step="0.1" defaultValue="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Crates sold</Label>
              <Input type="number" name="crates_sold" min={0} defaultValue="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Amount sold ($)</Label>
              <Input type="number" name="amount_sold" min={0} step="0.01" defaultValue="0.00" />
            </div>
            <div className="sm:col-span-2 md:col-span-4 lg:col-span-7">
              <Button type="submit" disabled={addRecord.isPending}>Log entry</Button>
            </div>
          </form>
        </div>

        {/* Totals Section */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Production Card */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Egg className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Crates Collected</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center border-t border-border/50 pt-3">
              <div>
                <p className="text-xs text-muted-foreground">This Week</p>
                <p className="text-lg font-semibold mt-1">{totals.week.production}</p>
              </div>
              <div className="border-x border-border/50">
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-lg font-semibold mt-1">{totals.month.production}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">This Year</p>
                <p className="text-lg font-semibold mt-1">{totals.year.production}</p>
              </div>
            </div>
          </div>

          {/* Crates Sold Card */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Crates Sold</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center border-t border-border/50 pt-3">
              <div>
                <p className="text-xs text-muted-foreground">This Week</p>
                <p className="text-lg font-semibold mt-1">{totals.week.sold}</p>
              </div>
              <div className="border-x border-border/50">
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-lg font-semibold mt-1">{totals.month.sold}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">This Year</p>
                <p className="text-lg font-semibold mt-1">{totals.year.sold}</p>
              </div>
            </div>
          </div>

          {/* Revenue Card */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-primary font-bold text-sm">$</span>
              <h3 className="font-semibold text-sm">Sales Revenue</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center border-t border-border/50 pt-3">
              <div>
                <p className="text-xs text-muted-foreground">This Week</p>
                <p className="text-lg font-semibold mt-1">${totals.week.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="border-x border-border/50">
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-lg font-semibold mt-1">${totals.month.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">This Year</p>
                <p className="text-lg font-semibold mt-1">${totals.year.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-semibold">Recent entries</h2>
          </div>
          <div className="divide-y divide-border">
            {records && records.length > 0 ? records.slice(0, 60).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-6 py-3">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="text-sm w-28 shrink-0">
                    <p className="font-medium">{new Date(r.record_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                    <p className="text-xs text-muted-foreground">{(r as any).flocks?.name ?? "All flocks"}</p>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span><span className="font-semibold">{r.crates_collected}</span> <span className="text-muted-foreground">crates collected</span></span>
                    {r.broken_crates > 0 && <span><span className="font-semibold">{r.broken_crates}</span> <span className="text-muted-foreground">broken</span></span>}
                    {Number(r.feed_kg) > 0 && <span><span className="font-semibold">{r.feed_kg}</span> <span className="text-muted-foreground">kg feed</span></span>}
                    {r.crates_sold > 0 && <span><span className="font-semibold">{r.crates_sold}</span> <span className="text-muted-foreground">crates sold</span></span>}
                    {Number(r.amount_sold) > 0 && <span><span className="font-semibold">${Number(r.amount_sold).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> <span className="text-muted-foreground">amount sold</span></span>}
                  </div>
                </div>
                <button onClick={() => deleteRecord.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )) : (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">No entries yet. Log your first one above.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
