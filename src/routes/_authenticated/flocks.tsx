import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Bird } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/flocks")({
  component: FlocksPage,
});

function FlocksPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <PageHeader
        title="Flocks"
        subtitle="Your bird groups, breeds, and counts."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Add flock</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New flock</DialogTitle></DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  createFlock.mutate({
                    name: fd.get("name"),
                    breed: fd.get("breed"),
                    bird_type: fd.get("bird_type"),
                    initial_count: Number(fd.get("initial_count") ?? 0),
                    date_acquired: fd.get("date_acquired"),
                    notes: fd.get("notes"),
                  });
                }}
              >
                <Field label="Flock name" name="name" required placeholder="House A" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Breed" name="breed" placeholder="ISA Brown" />
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select name="bird_type" defaultValue="layer">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="layer">Layer</SelectItem>
                        <SelectItem value="broiler">Broiler</SelectItem>
                        <SelectItem value="mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Initial count" name="initial_count" type="number" min={0} required defaultValue="100" />
                  <Field label="Date acquired" name="date_acquired" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
                <Field label="Notes" name="notes" placeholder="Optional" />
                <DialogFooter>
                  <Button type="submit" disabled={createFlock.isPending}>Save flock</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="px-6 md:px-10 py-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : flocks && flocks.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {flocks.map((f) => (
              <div key={f.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{f.name}</h3>
                    <p className="text-sm text-muted-foreground">{f.breed || "—"} · {f.bird_type}</p>
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
                  Acquired {new Date(f.date_acquired).toLocaleDateString()}
                </p>
              </div>
            ))}
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
