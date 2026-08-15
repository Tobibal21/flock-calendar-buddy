import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance")({
  component: FinancePage,
});

const PERIODS = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "12m", label: "Last 12 months", days: 365 },
] as const;

const INCOME_CATEGORIES = [
  { value: "manure_sold", label: "Manure sold" },
  { value: "birds_sold", label: "Birds sold" },
  { value: "other_income", label: "Other income" },
] as const;

const EXPENSE_CATEGORIES = [
  { value: "feed", label: "Feed" },
  { value: "vaccines_medication", label: "Vaccines & medication" },
  { value: "labor", label: "Labor" },
  { value: "equipment", label: "Equipment" },
  { value: "other_expense", label: "Other expense" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  eggs_sold: "Egg sales",
  ...Object.fromEntries([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map((c) => [c.value, c.label])),
};

function ngn(n: number) {
  return n.toLocaleString("en-NG", { style: "currency", currency: "NGN" });
}

function sinceDate(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

type FinanceRow = {
  id: string;
  type: string;
  category: string;
  amount: number;
  record_date: string;
  notes: string | null;
  flock_id: string | null;
  flocks?: { name: string } | null;
};

function FinancePage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("30d");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceRow | null>(null);
  const [formType, setFormType] = useState<"income" | "expense">("expense");
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");

  const { data: flocks } = useQuery({
    queryKey: ["flocks"],
    queryFn: async () => (await supabase.from("flocks").select("id,name")).data ?? [],
  });

  const { data: records } = useQuery({
    queryKey: ["finance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_records")
        .select("*, flocks(name)")
        .order("record_date", { ascending: false })
        .limit(400);
      if (error) throw error;
      return data as unknown as FinanceRow[];
    },
  });

  const { data: eggSales } = useQuery({
    queryKey: ["production-amounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_records")
        .select("record_date, amount_sold")
        .order("record_date", { ascending: false })
        .limit(800);
      if (error) throw error;
      return data;
    },
  });

  const openDialog = (row?: FinanceRow) => {
    setEditing(row ?? null);
    setFormType((row?.type as "income" | "expense") ?? "expense");
    setOpen(true);
  };

  const upsert = useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: Record<string, unknown> }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      if (id) {
        const { error } = await supabase.from("finance_records").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("finance_records").insert({ ...payload, user_id: user.id } as never);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? "Entry updated" : "Entry logged");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("finance_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry deleted");
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const days = PERIODS.find((p) => p.key === period)!.days;

  const summary = useMemo(() => {
    const start = sinceDate(days);
    const inRange = (records ?? []).filter((r) => new Date(r.record_date) >= start);
    const eggIncome = (eggSales ?? [])
      .filter((r) => new Date(r.record_date) >= start)
      .reduce((s, r) => s + Number(r.amount_sold ?? 0), 0);
    const otherIncome = inRange.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
    const expenses = inRange.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);

    const byCategory = (type: string) => {
      const map = new Map<string, number>();
      if (type === "income" && eggIncome > 0) map.set("eggs_sold", eggIncome);
      inRange.filter((r) => r.type === type).forEach((r) => {
        map.set(r.category, (map.get(r.category) ?? 0) + Number(r.amount));
      });
      return Array.from(map.entries())
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total);
    };

    return {
      eggIncome,
      otherIncome,
      income: eggIncome + otherIncome,
      expenses,
      net: eggIncome + otherIncome - expenses,
      incomeCats: byCategory("income"),
      expenseCats: byCategory("expense"),
    };
  }, [records, eggSales, days]);

  const visible = (records ?? []).filter((r) => filter === "all" || r.type === filter);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const flockId = fd.get("flock_id") as string;
    upsert.mutate({
      id: editing?.id,
      payload: {
        type: formType,
        category: fd.get("category"),
        amount: Number(fd.get("amount") ?? 0),
        record_date: fd.get("record_date"),
        flock_id: flockId === "all" ? null : flockId,
        notes: (fd.get("notes") as string) || null,
      },
    });
  };

  const categories = formType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle="Track income and expenses to see your farm's profit or loss."
        actions={
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add entry</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit entry" : "Add entry"}</DialogTitle></DialogHeader>
              <form key={editing?.id ?? "new"} className="space-y-3" onSubmit={handleSubmit}>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["income", "expense"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormType(t)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors",
                          formType === t
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-accent/30",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    key={formType}
                    name="category"
                    defaultValue={
                      editing && categories.some((c) => c.value === editing.category)
                        ? editing.category
                        : categories[0].value
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Amount (₦)</Label>
                    <Input id="amount" name="amount" type="number" min={0} step="0.01" required defaultValue={editing?.amount ?? ""} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="record_date">Date</Label>
                    <Input id="record_date" name="record_date" type="date" required defaultValue={editing?.record_date ?? today} />
                  </div>
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
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" placeholder="Optional details" defaultValue={editing?.notes ?? ""} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={upsert.isPending}>{editing ? "Save changes" : "Add entry"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="px-6 md:px-10 py-6 space-y-6">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                period === p.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent/30",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Total income</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{ngn(summary.income)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Egg sales {ngn(summary.eggIncome)} (from Production) · Other income {ngn(summary.otherIncome)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="h-4 w-4" /> Total expenses</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{ngn(summary.expenses)}</p>
            <p className="mt-2 text-xs text-muted-foreground">Feed, medication, labor and more</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Wallet className="h-4 w-4" /> Net {summary.net < 0 ? "loss" : "profit"}</p>
            <p className={cn("mt-2 text-3xl font-semibold tracking-tight", summary.net < 0 ? "text-destructive" : "text-primary")}>
              {ngn(summary.net)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Income minus expenses</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Breakdown title="Income by category" rows={summary.incomeCats} total={summary.income} tone="primary" />
          <Breakdown title="Expenses by category" rows={summary.expenseCats} total={summary.expenses} tone="destructive" />
        </div>

        <Section
          title="Recent entries"
          count={visible.length}
          right={
            <div className="flex gap-1.5">
              {(["all", "income", "expense"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                    filter === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/30",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          }
        >
          {visible.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No entries yet. Add your first income or expense above.
            </p>
          ) : visible.slice(0, 60).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-4 px-6 py-3">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {CATEGORY_LABELS[r.category] ?? r.category}
                  <span className={cn("ml-2 text-xs font-semibold", r.type === "income" ? "text-primary" : "text-destructive")}>
                    {r.type === "income" ? "+" : "−"}{ngn(Number(r.amount))}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {new Date(r.record_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {" · "}{r.flocks?.name ?? "All flocks"}
                  {r.notes ? ` · ${r.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => openDialog(r)} className="text-muted-foreground hover:text-primary">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove.mutate(r.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}

function Breakdown({ title, rows, total, tone }: { title: string; rows: { category: string; total: number }[]; total: number; tone: "primary" | "destructive" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nothing recorded in this period.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((r) => (
            <div key={r.category}>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                <span className="font-semibold">{ngn(r.total)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full", tone === "primary" ? "bg-primary" : "bg-destructive")}
                  style={{ width: `${total > 0 ? Math.max(2, (r.total / total) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, right, children }: { title: string; count: number; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex items-center gap-3">
          {right}
          <span className="text-xs text-muted-foreground">{count}</span>
        </div>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}
