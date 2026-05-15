import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Calendar, Check, Trash2, Download, ExternalLink, Syringe } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildIcs, downloadIcs, googleCalendarUrl } from "@/lib/ics";

export const Route = createFileRoute("/_authenticated/vaccines")({
  component: VaccinesPage,
});

function VaccinesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: flocks } = useQuery({
    queryKey: ["flocks"],
    queryFn: async () => (await supabase.from("flocks").select("id,name")).data ?? [],
  });

  const { data: vaccines } = useQuery({
    queryKey: ["vaccines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vaccinations")
        .select("*, flocks(name)")
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addVacc = useMutation({
    mutationFn: async (payload: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("vaccinations").insert({ ...payload, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vaccine scheduled");
      qc.invalidateQueries({ queryKey: ["vaccines"] });
      qc.invalidateQueries({ queryKey: ["vaccines-upcoming"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateVacc = useMutation({
    mutationFn: async ({ id, ...patch }: any) => {
      const { error } = await supabase.from("vaccinations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vaccines"] });
      qc.invalidateQueries({ queryKey: ["vaccines-upcoming"] });
    },
  });

  const deleteVacc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vaccinations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vaccines"] }),
  });

  const exportAll = () => {
    const upcoming = (vaccines ?? []).filter((v) => !v.administered);
    if (upcoming.length === 0) {
      toast.error("No upcoming vaccines to export");
      return;
    }
    const ics = buildIcs(
      upcoming.map((v) => ({
        uid: v.id,
        title: `Vaccine: ${v.vaccine_name}`,
        description: `Flock: ${(v as any).flocks?.name ?? "All"}${v.notes ? `\n${v.notes}` : ""}`,
        date: v.scheduled_date,
      })),
    );
    downloadIcs("coopkeeper-vaccines", ics);
    toast.success("Calendar file downloaded");
  };

  const upcoming = vaccines?.filter((v) => !v.administered) ?? [];
  const done = vaccines?.filter((v) => v.administered) ?? [];

  return (
    <>
      <PageHeader
        title="Vaccines"
        subtitle="Schedule reminders and add them to Google Calendar."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportAll}>
              <Download className="h-4 w-4" /> Export all (.ics)
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4" /> Schedule</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Schedule vaccine</DialogTitle></DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const flockId = fd.get("flock_id") as string;
                    addVacc.mutate({
                      vaccine_name: fd.get("vaccine_name"),
                      scheduled_date: fd.get("scheduled_date"),
                      flock_id: flockId === "all" ? null : flockId,
                      notes: fd.get("notes"),
                    });
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="vaccine_name">Vaccine</Label>
                    <Input id="vaccine_name" name="vaccine_name" required placeholder="Newcastle (NDV)" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="scheduled_date">Date</Label>
                      <Input id="scheduled_date" name="scheduled_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
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
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" name="notes" placeholder="Dose, route, etc." />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={addVacc.isPending}>Schedule</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="px-6 md:px-10 py-6 space-y-6">
        <Section title="Upcoming" count={upcoming.length}>
          {upcoming.length === 0 ? (
            <Empty />
          ) : upcoming.map((v) => (
            <VaccineRow
              key={v.id}
              v={v}
              onMarkDone={() => updateVacc.mutate({ id: v.id, administered: true, administered_date: new Date().toISOString().slice(0, 10) })}
              onDelete={() => deleteVacc.mutate(v.id)}
            />
          ))}
        </Section>

        {done.length > 0 && (
          <Section title="Completed" count={done.length}>
            {done.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-4 px-6 py-3 opacity-70">
                <div>
                  <p className="font-medium line-through">{v.vaccine_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(v as any).flocks?.name ?? "All flocks"} · administered {v.administered_date && new Date(v.administered_date).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => deleteVacc.mutate(v.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </Section>
        )}
      </div>
    </>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function VaccineRow({ v, onMarkDone, onDelete }: { v: any; onMarkDone: () => void; onDelete: () => void }) {
  const ev = {
    uid: v.id,
    title: `Vaccine: ${v.vaccine_name}`,
    description: `Flock: ${v.flocks?.name ?? "All"}${v.notes ? `\n${v.notes}` : ""}`,
    date: v.scheduled_date,
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/30 text-primary shrink-0">
          <Syringe className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{v.vaccine_name}</p>
          <p className="text-xs text-muted-foreground">
            <Calendar className="inline h-3 w-3 mr-1" />
            {new Date(v.scheduled_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            {" · "}{v.flocks?.name ?? "All flocks"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <a href={googleCalendarUrl(ev)} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /> Google</Button>
        </a>
        <Button variant="ghost" size="sm" onClick={() => downloadIcs(`vaccine-${v.vaccine_name}`, buildIcs([ev]))}>
          <Download className="h-3.5 w-3.5" /> .ics
        </Button>
        <Button variant="outline" size="sm" onClick={onMarkDone}>
          <Check className="h-3.5 w-3.5" /> Done
        </Button>
        <button onClick={onDelete} className="ml-1 text-muted-foreground hover:text-destructive p-1.5">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <p className="px-6 py-8 text-center text-sm text-muted-foreground">
      No upcoming vaccines. Schedule one to get reminders.
    </p>
  );
}
