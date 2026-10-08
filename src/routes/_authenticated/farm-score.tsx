import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComponentBars, ScoreDial, SummaryGrid } from "@/components/farm-score/ScoreParts";
import type { ScoreComponent, ScoreSummary } from "@/lib/farm-score";

export const Route = createFileRoute("/_authenticated/farm-score")({
  head: () => ({
    meta: [
      { title: "Farm Record Score — Flock Keeper" },
      { name: "description", content: "See how complete and consistent your farm records are." },
      { property: "og:title", content: "Farm Record Score — Flock Keeper" },
      { property: "og:description", content: "See how complete and consistent your farm records are." },
    ],
  }),
  component: FarmScorePage,
});

type ScoreResult = {
  score: number | null;
  components: ScoreComponent[];
  flags: string[];
  months_of_records: number;
  summary: ScoreSummary;
  needed_records?: number;
  needed_days?: number;
};

const CONSENT =
  "Anyone with this link can see my score and farm summary until it expires or I turn it off. They cannot see my individual records.";

function FarmScorePage() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("30");
  const [consent, setConsent] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);

  const score = useQuery({
    queryKey: ["farm-score"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase.rpc("compute_farm_score", { p_user_id: user.id });
      if (error) throw error;
      return data as unknown as ScoreResult;
    },
    staleTime: 60_000,
  });

  const shares = useQuery({
    queryKey: ["report-shares"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_shares").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const linkFor = (token: string) => `${window.location.origin}/r/${token}`;
  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  const createShare = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const expires = new Date(Date.now() + Number(days) * 86400000).toISOString();
      const { data, error } = await supabase
        .from("report_shares")
        .insert({ user_id: user.id, label: label.trim() || null, expires_at: expires } as never)
        .select("token")
        .single();
      if (error) throw error;
      return data.token as string;
    },
    onSuccess: (token) => {
      setNewLink(linkFor(token));
      setLabel("");
      setConsent(false);
      qc.invalidateQueries({ queryKey: ["report-shares"] });
      toast.success("Share link created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_shares").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-shares"] });
      toast.success("Link turned off");
    },
  });

  const s = score.data;

  return (
    <div>
      <PageHeader
        title="Farm Record Score"
        subtitle="How complete and believable your Flock Keeper records are"
        actions={
          <Button variant="outline" onClick={() => score.refetch()} disabled={score.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${score.isFetching ? "animate-spin" : ""}`} /> Recalculate
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-6 md:px-10">
        {score.isLoading && <p className="text-sm text-muted-foreground">Calculating your score…</p>}
        {score.error && <p className="text-sm text-destructive">Could not calculate your score. Try again.</p>}

        {s && s.score == null && (
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Keep logging</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We need a little more history before we can give you a Farm Record Score.
            </p>
            <ul className="mt-3 list-disc pl-5 text-sm">
              {!!s.needed_records && <li>{s.needed_records} more production records</li>}
              {!!s.needed_days && <li>{s.needed_days} more days since your first record</li>}
            </ul>
          </section>
        )}

        {s && s.score != null && (
          <>
            <section className="rounded-xl border border-border bg-card p-5">
              <ScoreDial score={s.score} months={s.months_of_records} />
            </section>
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold">What makes up your score</h2>
              <ComponentBars components={s.components} />
            </section>
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 font-semibold">Things to check</h2>
              {s.flags.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to fix right now. Nice work.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {s.flags.map((f) => <li key={f}>{f}</li>)}
                </ul>
              )}
            </section>
          </>
        )}

        {s && s.score != null && (
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Farm summary</h2>
            <div className="mt-3"><SummaryGrid s={s.summary} /></div>
          </section>
        )}

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Share your report</h2>
          <p className="mt-1 text-sm text-muted-foreground">Show a supplier or partner your score and farm summary.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="label">Who is this for (optional)</Label>
              <Input id="label" value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Feed supplier" />
            </div>
            <div>
              <Label>Link expires after</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span>{CONSENT}</span>
          </label>
          <Button className="mt-4" disabled={!consent || createShare.isPending} onClick={() => createShare.mutate()}>
            Create share link
          </Button>
          {newLink && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
              <span className="truncate text-sm">{newLink}</span>
              <Button size="sm" variant="outline" onClick={() => copy(newLink)}>
                <Copy className="mr-1 h-4 w-4" /> Copy
              </Button>
            </div>
          )}

          <h3 className="mt-6 text-sm font-semibold">Your share links</h3>
          {(shares.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No links yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {shares.data!.map((r) => {
                const status = r.revoked_at ? "Revoked" : new Date(r.expires_at) < new Date() ? "Expired" : "Active";
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <div className="font-medium">{r.label || "Untitled link"}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(r.created_at).toLocaleDateString("en-NG")} · Expires{" "}
                        {new Date(r.expires_at).toLocaleDateString("en-NG")} · {r.view_count} views ·{" "}
                        <span className={status === "Active" ? "text-primary" : ""}>{status}</span>
                      </div>
                    </div>
                    {status === "Active" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => copy(linkFor(r.token))}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => revoke.mutate(r.id)}>Revoke</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
