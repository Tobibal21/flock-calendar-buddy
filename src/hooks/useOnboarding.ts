import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OnboardingState = {
  user_id: string;
  dismissed: boolean;
  tour_completed: boolean;
};

export const TOUR_EVENT = "flockkeeper:start-tour";

export function startTour() {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT));
}

async function fetchOnboarding(): Promise<OnboardingState | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("onboarding_state")
    .select("user_id,dismissed,tour_completed")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useOnboardingState() {
  return useQuery({
    queryKey: ["onboarding-state"],
    queryFn: fetchOnboarding,
    staleTime: 5 * 60_000,
  });
}

export async function saveOnboarding(patch: { dismissed?: boolean; tour_completed?: boolean }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("onboarding_state")
    .upsert(
      {
        user_id: user.id,
        dismissed: patch.dismissed ?? false,
        tour_completed: patch.tour_completed ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

export function useSaveOnboarding() {
  const qc = useQueryClient();
  return async (patch: { dismissed?: boolean; tour_completed?: boolean }) => {
    await saveOnboarding(patch).catch(() => {});
    qc.invalidateQueries({ queryKey: ["onboarding-state"] });
  };
}

/** Counts used to tell a brand-new farm apart from one that already has data. */
export function useFarmActivity() {
  return useQuery({
    queryKey: ["farm-activity"],
    queryFn: async () => {
      const [flocks, production, finance, vaccines] = await Promise.all([
        supabase.from("flocks").select("id", { count: "exact", head: true }),
        supabase.from("production_records").select("id", { count: "exact", head: true }),
        supabase.from("finance_records").select("id", { count: "exact", head: true }),
        supabase.from("vaccinations").select("id", { count: "exact", head: true }),
      ]);
      return {
        flocks: flocks.count ?? 0,
        production: production.count ?? 0,
        finance: finance.count ?? 0,
        vaccines: vaccines.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}
