export type ScoreComponent = { key: string; label: string; points: number; max: number; tip: string };
export type ScoreSummary = {
  total_eggs?: number;
  avg_lay_rate?: number | null;
  total_income?: number;
  total_expenses?: number;
  net?: number;
  mortality_rate?: number | null;
  vaccination_rate?: number | null;
};

export function scoreBand(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 65) return "Strong";
  if (score >= 40) return "Fair";
  return "Building";
}

export const naira = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(n ?? 0));

export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);
