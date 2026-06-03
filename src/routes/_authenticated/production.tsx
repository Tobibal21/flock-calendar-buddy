import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Egg, Pencil, Trash2, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cratesInputToEggs, formatCrates, eggsAsCrateDecimal } from "@/lib/eggs";

export const Route = createFileRoute("/_authenticated/production")({
  component: ProductionPage,
});

const PERIODS = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "12m", label: "Last 12 months", days: 365 },
] as const;

function sinceDate(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

function ProductionPage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState<any | null>(null);

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

  const upsertRecord = useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: any }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      if (id) {
        const { error } = await supabase.from("production_records").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("production_records").insert({ ...payload, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? "Updated" : "Logged");
      setEditing(null);
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
    return PERIODS.map((p) => {
      const start = sinceDate(p.days);
      const inRange = (records ?? []).filter((r) => new Date(r.record_date) >= start);
      return {
        label: p.label,
        collected: inRange.reduce((s, r) => s + (r.eggs_collected ?? 0), 0),
        sold: inRange.reduce((s, r) => s + ((r as any).crates_sold ?? 0), 0),
        amount: inRange.reduce((s, r) => s + Number((r as any).amount_sold ?? 0), 0),
        feed: inRange.reduce((s, r) => s + Number((r as any).feed_kg ?? 0), 0),
      };
    });
  }, [records]);

  const soldChart = useMemo(() => {
    const map = new Map<string, { collected: number; sold: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      map.set(d, { collected: 0, sold: 0 });
    }
    (records ?? []).forEach((r) => {
      const cur = map.get(r.record_date);
      if (cur) {
        cur.collected += eggsAsCrateDecimal(r.eggs_collected ?? 0);
        cur.sold += eggsAsCrateDecimal((r as any).crates_sold ?? 0);
      }
    });
    return Array.from(map.entries()).map(([d, v]) => ({ date: d.slice(5), ...v }));
  }, [records]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const flockId = fd.get("flock_id") as string;
    const payload = {
      flock_id: flockId === "all" ? null : flockId,
      record_date: fd.get("record_date"),
      eggs_collected: cratesInputToEggs(fd.get("crates") as string),
      crates_sold: cratesInputToEggs(fd.get("crates_sold") as string),
      broken_eggs: Number(fd.get("broken") ?? 0),
      amount_sold: Number(fd.get("amount_sold") ?? 0),
      feed_kg: Number(fd.get("feed") ?? 0),
    };
    upsertRecord.mutate({ id: editing?.id, payload });
    if (!editing) {
      (e.target as HTMLFormElement).reset();
      setDate(today);
    }
  };

  return (
    <>
      <PageHeader title="Daily production" subtitle="Log eggs in crates.pieces (e.g. 6.10 = 6 crates + 10 eggs), sales and feed." />

      <div className="px-6 md:px-10 py-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {totals.map((t) => (
            <div key={t.label} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">{t.label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{formatCrates(t.collected)}</p>
              <p className="text-xs text-muted-foreground">crates collected</p>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sold</span>
                  <span className="font-semibold">{formatCrates(t.sold)} crates</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revenue</span>
                  <span className="font-semibold">{t.amount.toLocaleString("en-NG", { style: "currency", currency: "NGN" })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Feed</span>
                  <span className="font-semibold">{t.feed.toLocaleString()} kg</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold">Eggs collected vs sold</h2>
          <p className="text-sm text-muted-foreground">Last 30 days (in crates)</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={soldChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="collGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="soldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent-foreground)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-accent-foreground)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="collected" name="Collected" stroke="var(--color-primary)" strokeWidth={2} fill="url(#collGrad)" />
                <Area type="monotone" dataKey="sold" name="Sold" stroke="var(--color-accent-foreground)" strokeWidth={2} fill="url(#soldGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Egg className="h-4 w-4 text-primary" /> {editing ? "Edit entry" : "Quick log"}
            </div>
            {editing && (
              <button type="button" onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
                <X className="h-4 w-4" /> Cancel
              </button>
            )}
          </div>
          <form key={editing?.id ?? "new"} className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" name="record_date" value={editing ? undefined : date} defaultValue={editing?.record_date} onChange={editing ? undefined : (e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Flock</Label>
              <Select name="flock_id" defaultValue={editing?.flock_id ?? "all"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All flocks</SelectItem>
                  {flocks?.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Collected (crates.pieces)</Label>
              <Input type="text" inputMode="decimal" name="crates" placeholder="6.10" defaultValue={editing ? formatCrates(editing.eggs_collected) : ""} required />
            </div>
            <div className="space-y-1.5">
              <Label>Sold (crates.pieces)</Label>
              <Input type="text" inputMode="decimal" name="crates_sold" placeholder="0.00" defaultValue={editing ? formatCrates(editing.crates_sold) : ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount sold (₦)</Label>
              <Input type="number" name="amount_sold" min={0} step="0.01" defaultValue={editing?.amount_sold ?? 0} />
            </div>
            <div className="space-y-1.5">
              <Label>Feed (kg)</Label>
              <Input type="number" name="feed" min={0} step="0.01" defaultValue={editing?.feed_kg ?? 0} />
            </div>
            <div className="space-y-1.5">
              <Label>Broken eggs</Label>
              <Input type="number" name="broken" min={0} defaultValue={editing?.broken_eggs ?? 0} />
            </div>
            <div className="lg:col-span-6">
              <Button type="submit" disabled={upsertRecord.isPending}>{editing ? "Save changes" : "Log entry"}</Button>
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
                    <span><span className="font-semibold">{formatCrates(r.eggs_collected)}</span> <span className="text-muted-foreground">crates</span></span>
                    {(r as any).crates_sold > 0 && <span><span className="font-semibold">{formatCrates((r as any).crates_sold)}</span> <span className="text-muted-foreground">sold</span></span>}
                    {Number((r as any).amount_sold) > 0 && <span><span className="font-semibold">{Number((r as any).amount_sold).toLocaleString("en-NG", { style: "currency", currency: "NGN" })}</span></span>}
                    {Number((r as any).feed_kg) > 0 && <span><span className="font-semibold">{Number((r as any).feed_kg).toLocaleString()}</span> <span className="text-muted-foreground">kg feed</span></span>}
                    {r.broken_eggs > 0 && <span><span className="font-semibold">{r.broken_eggs}</span> <span className="text-muted-foreground">broken</span></span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => { setEditing(r); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-muted-foreground hover:text-primary">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => deleteRecord.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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
