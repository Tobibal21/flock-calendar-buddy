import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Bird, Egg, Drumstick } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/flocks")({
  component: FlocksPage,
  head: () => ({
    meta: [
      { title: "Flocks — Flock Keeper" },
      { name: "description", content: "Track your layer and broiler flocks, bird counts and flock age in weeks." },
      { property: "og:title", content: "Flocks — Flock Keeper" },
      { property: "og:description", content: "Track your layer and broiler flocks, bird counts and flock age in weeks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

export type FlockType = "layers" | "broilers";

export function ageInWeeks(acquired: string | null | undefined) {
  if (!acquired) return null;
  const ms = Date.now() - new Date(acquired).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24 * 7)));
}

function TypePicker({ value, onChange }: { value: FlockType | null; onChange: (v: FlockType) => void }) {
  const options = [
    { key: "layers" as const, label: "Layers", hint: "Egg-laying birds", Icon: Egg },
    { key: "broilers" as const, label: "Broilers", hint: "Birds raised for meat", Icon: Drumstick },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map(({ key, label, hint, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "rounded-xl border p-4 text-left transition-colors",
            value === key ? "border-primary bg-primary/10" : "border-border hover:bg-accent/30",
          )}
        >
          <Icon className={cn("h-5 w-5", value === key ? "text-primary" : "text-muted-foreground")} />
          <p className="mt-2 font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </button>
      ))}
    </div>
  );
}

function FlocksPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [flockType, setFlockType] = useState<FlockType | null>(null);

  const { data: flocks, isLoading } = useQuery({
    queryKey: ["flocks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("flocks").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createFlock = useMutation({
    mutationFn: async (payload: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("flocks").insert({ ...payload, user_id: user.id, current_count: payload.initial_count });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Flock added");
      qc.invalidateQueries({ queryKey: ["flocks"] });
      setOpen(false);
      setFlockType(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const classify = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: FlockType }) => {
      const { error } = await supabase.from("flocks").update({ flock_type: type } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Flock classified");
      qc.invalidateQueries({ queryKey: ["flocks"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteFlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("flocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Flock removed");
      qc.invalidateQueries({ queryKey: ["flocks"] });
    },
  });

  const unclassified = (flocks ?? []).filter((f: any) => !f.flock_type);

  return (
    <>
      <PageHeader
        title="Flocks"
        subtitle="Your bird groups, breeds, ages and counts."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFlockType(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Add flock</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New flock</DialogTitle></DialogHeader>

              {!flockType ? (
                <div className="space-y-3">
                  <Label>What kind of birds are these?</Label>
                  <TypePicker value={flockType} onChange={setFlockType} />
                  <p className="text-xs text-muted-foreground">
                    This can't be changed later, so pick carefully.
                  </p>
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const acquired = (fd.get("acquisition_date") as string) || null;
                    if (flockType === "broilers" && !acquired) {
                      toast.error("Acquisition date is required for broilers");
                      return;
                    }
                    createFlock.mutate({
                      name: fd.get("name"),
                      breed: fd.get("breed"),
                      flock_type: flockType,
                      bird_type: flockType === "layers" ? "layer" : "broiler",
                      initial_count: Number(fd.get("initial_count") ?? 0),
                      acquisition_date: acquired,
                      date_acquired: acquired ?? new Date().toISOString().slice(0, 10),
                      notes: fd.get("notes"),
                    });
                  }}
                >
                  <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
                    <p className="text-sm font-medium capitalize">{flockType}</p>
                    <button type="button" className="text-xs text-primary" onClick={() => setFlockType(null)}>
                      Change
                    </button>
                  </div>
                  <Field label="Flock name" name="name" required placeholder="House A" />
                  <Field label="Breed" name="breed" placeholder={flockType === "layers" ? "ISA Brown" : "Cobb 500"} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Initial count" name="initial_count" type="number" min={0} required defaultValue="100" />
                    <Field
                      label={flockType === "broilers" ? "Acquisition date" : "Acquisition date (optional)"}
                      name="acquisition_date"
                      type="date"
                      required={flockType === "broilers"}
                      defaultValue={flockType === "broilers" ? new Date().toISOString().slice(0, 10) : ""}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Used to show the flock's age in weeks.</p>
                  <Field label="Notes" name="notes" placeholder="Optional" />
                  <DialogFooter>
                    <Button type="submit" disabled={createFlock.isPending}>Save flock</Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        }
      />

      <div className="px-6 md:px-10 py-6 space-y-6">
        {unclassified.length > 0 && (
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
            <h3 className="font-semibold">Classify your existing flocks</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us whether each flock below is layers or broilers. This is saved permanently and decides which income
              options you see for that flock.
            </p>
            <div className="mt-4 space-y-3">
              {unclassified.map((f: any) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                  <p className="font-medium">{f.name}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={classify.isPending} onClick={() => classify.mutate({ id: f.id, type: "layers" })}>
                      Layers
                    </Button>
                    <Button size="sm" variant="outline" disabled={classify.isPending} onClick={() => classify.mutate({ id: f.id, type: "broilers" })}>
                      Broilers
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : flocks && flocks.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {flocks.map((f: any) => {
              const weeks = ageInWeeks(f.acquisition_date ?? f.date_acquired);
              return (
                <div key={f.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{f.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {f.breed || "—"} · {f.flock_type ? (f.flock_type === "layers" ? "Layers" : "Broilers") : "Unclassified"}
                      </p>
                    </div>
                    <button
                      onClick={() => { if (confirm(`Delete ${f.name}?`)) deleteFlock.mutate(f.id); }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <Stat label="Current" value={f.current_count} />
                    <Stat label="Initial" value={f.initial_count} />
                    <Stat label="Mortality" value={f.mortality_count} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {weeks !== null
                      ? `${weeks} week${weeks === 1 ? "" : "s"} old · acquired ${new Date(f.acquisition_date ?? f.date_acquired).toLocaleDateString()}`
                      : "Acquisition date not set"}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <Bird className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">No flocks yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add your first flock to start tracking.</p>
          </div>
        )}
      </div>
    </>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={rest.name}>{label}</Label>
      <Input id={rest.name} {...rest} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
