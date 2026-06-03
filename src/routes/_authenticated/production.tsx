import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Egg, Trash2 } from "lucide-react";
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

type Period = "week" | "month" | "year";

function startOf(period: Period): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "week") {
    const day = (d.getDay() + 6) % 7; // Monday start
    d.setDate(d.getDate() - day);
  } else if (period === "month") {
    d.setDate(1);
  } else {
    d.setMonth(0, 1);
  }
  return d;
}

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
      const { data, error } = await supabase
        .from("production_records")
        .select("*, flocks(name)")
        .order("record_date", { ascending: false })
        .limit(400);
      if (error) throw error;
      return data;
    },
  });

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

  const totals = useMemo(() => {
    const periods: Period[] = ["week", "month", "year"];
    return periods.map((p) => {
      const start = startOf(p);
      const inRange = (records ?? []).filter((r) => new Date(r.record_date) >= start);
      return {
        period: p,
        crates: inRange.reduce((s, r) => s + (r.eggs_collected ?? 0), 0),
        sold: inRange.reduce((s, r) => s + ((r as any).crates_sold ?? 0), 0),
        amount: inRange.reduce((s, r) => s + Number((r as any).amount_sold ?? 0), 0),
      };
    });
  }, [records]);

  return (
    <>
      <PageHeader title="Daily production" subtitle="Log crates collected and sold each day, per flock." />

      <div className="px-6 md:px-10 py-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {totals.map((t) => (
            <div key={t.period} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground capitalize">This {t.period}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{t.crates.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">crates collected</p>
              <div className="mt-3 flex justify-between text-sm">
                <span><span className="font-semibold">{t.sold.toLocaleString()}</span> <span className="text-muted-foreground">sold</span></span>
                <span className="font-semibold">{t.amount.toLocaleString(undefined, { style: "currency", currency: "USD" })}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Egg className="h-4 w-4 text-primary" /> Quick log
          </div>
          <form
            className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const flockId = fd.get("flock_id") as string;
              addRecord.mutate({
                flock_id: flockId === "all" ? null : flockId,
                record_date: fd.get("record_date"),
                eggs_collected: Number(fd.get("crates") ?? 0),
                broken_eggs: Number(fd.get("broken") ?? 0),
                crates_sold: Number(fd.get("crates_sold") ?? 0),
                amount_sold: Number(fd.get("amount_sold") ?? 0),
                feed_kg: Number(fd.get("feed") ?? 0),
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
              <Input type="number" name="crates" min={0} required defaultValue="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Crates sold</Label>
              <Input type="number" name="crates_sold" min={0} defaultValue="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Amount sold</Label>
              <Input type="number" name="amount_sold" min={0} step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Broken</Label>
              <Input type="number" name="broken" min={0} defaultValue="0" />
            </div>
            <div className="lg:col-span-6">
              <Button type="submit" disabled={addRecord.isPending}>Log entry</Button>
            </div>
          </form>
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
                    <span><span className="font-semibold">{r.eggs_collected}</span> <span className="text-muted-foreground">crates</span></span>
                    {(r as any).crates_sold > 0 && <span><span className="font-semibold">{(r as any).crates_sold}</span> <span className="text-muted-foreground">sold</span></span>}
                    {Number((r as any).amount_sold) > 0 && <span><span className="font-semibold">{Number((r as any).amount_sold).toLocaleString(undefined, { style: "currency", currency: "USD" })}</span></span>}
                    {r.broken_eggs > 0 && <span><span className="font-semibold">{r.broken_eggs}</span> <span className="text-muted-foreground">broken</span></span>}
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
