import { naira, pct, scoreBand, type ScoreComponent, type ScoreSummary } from "@/lib/farm-score";

export function ScoreDial({ score, months }: { score: number; months: number }) {
  return (
    <div className="flex items-center gap-5">
      <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-4 border-primary bg-primary/10">
        <span className="text-3xl font-semibold text-primary">{score}</span>
      </div>
      <div>
        <div className="text-xl font-semibold">{scoreBand(score)}</div>
        <div className="text-sm text-muted-foreground">Farm Record Score out of 100</div>
        <div className="text-sm text-muted-foreground">{months} months of records</div>
      </div>
    </div>
  );
}

export function ComponentBars({ components, showTips = true }: { components: ScoreComponent[]; showTips?: boolean }) {
  return (
    <div className="space-y-4">
      {components.map((c) => (
        <div key={c.key}>
          <div className="flex justify-between text-sm font-medium">
            <span>{c.label}</span>
            <span className="text-muted-foreground">
              {c.points} / {c.max}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (c.points / c.max) * 100)}%` }} />
          </div>
          {showTips && <p className="mt-1 text-xs text-muted-foreground">{c.tip}</p>}
        </div>
      ))}
    </div>
  );
}

export function SummaryGrid({ s }: { s: ScoreSummary }) {
  const items = [
    ["Eggs collected", Number(s.total_eggs ?? 0).toLocaleString("en-NG")],
    ["Average lay rate", pct(s.avg_lay_rate)],
    ["Total income", naira(s.total_income)],
    ["Total expenses", naira(s.total_expenses)],
    ["Net", naira(s.net)],
    ["Mortality rate", pct(s.mortality_rate)],
    ["Vaccinations completed", pct(s.vaccination_rate)],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">{k}</div>
          <div className="mt-1 font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}
