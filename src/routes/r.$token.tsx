import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Egg } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ComponentBars, ScoreDial, SummaryGrid } from "@/components/farm-score/ScoreParts";
import type { ScoreComponent, ScoreSummary } from "@/lib/farm-score";

type Report = {
  valid: boolean;
  farm_name?: string;
  score?: number | null;
  components?: ScoreComponent[];
  months_of_records?: number;
  generated_at?: string;
  expires_at?: string;
  summary?: ScoreSummary;
};

export const Route = createFileRoute("/r/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Farm Record Report — Flock Keeper" },
      { name: "description", content: "A shared Flock Keeper farm record quality report." },
      { property: "og:title", content: "Farm Record Report — Flock Keeper" },
      { property: "og:description", content: "A shared Flock Keeper farm record quality report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { httpEquiv: "Cache-Control", content: "no-store" },
    ],
  }),
  headers: () => ({ "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow" }),
  component: SharedReport,
});

function SharedReport() {
  const { token } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["shared-report", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_shared_report", { p_token: token });
      if (error) return { valid: false } as Report;
      return data as unknown as Report;
    },
    staleTime: Infinity,
    retry: false,
  });

  const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("en-NG", { dateStyle: "medium" }) : "—");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl space-y-5 px-5 py-8">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Egg className="h-4 w-4" />
          </span>
          Flock Keeper
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading report…</p>}

        {data && !data.valid && (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <h1 className="text-lg font-semibold">This link isn't available</h1>
            <p className="mt-1 text-sm text-muted-foreground">Please ask the farmer to send you a new link.</p>
          </div>
        )}

        {data?.valid && (
          <>
            <div>
              <h1 className="text-2xl font-semibold">{data.farm_name}</h1>
              <p className="text-sm text-muted-foreground">Farm Record Score report</p>
            </div>
            <section className="rounded-xl border border-border bg-card p-5">
              {data.score != null ? (
                <ScoreDial score={data.score} months={data.months_of_records ?? 0} />
              ) : (
                <p className="text-sm">Not enough records yet for a score · {data.months_of_records} months of records</p>
              )}
            </section>
            {!!data.components?.length && (
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="mb-4 font-semibold">Score breakdown</h2>
                <ComponentBars components={data.components} showTips={false} />
              </section>
            )}
            {data.summary && (
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="mb-3 font-semibold">Farm summary</h2>
                <SummaryGrid s={data.summary} />
              </section>
            )}
            <p className="text-xs text-muted-foreground">
              Generated {fmt(data.generated_at)} · Link expires {fmt(data.expires_at)}
            </p>
          </>
        )}

        <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
          Self-reported records checked by automated consistency tests. This is a record quality score, not a credit score.
        </footer>
      </div>
    </div>
  );
}
