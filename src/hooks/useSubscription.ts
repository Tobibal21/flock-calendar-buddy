import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Subscriber = Tables<"subscribers">;

export async function fetchSubscriber(): Promise<Subscriber | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("subscribers")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function daysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** True when the user may use the app (active plan, or trial not yet expired). */
export function hasAccess(sub: Subscriber | null): boolean {
  if (!sub) return true; // no row yet — don't lock anyone out
  if (sub.status === "active") return true;
  if (sub.status === "trialing") {
    return !sub.trial_ends_at || new Date(sub.trial_ends_at).getTime() > Date.now();
  }
  return false;
}

export function useSubscription() {
  const query = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscriber,
    staleTime: 30_000,
  });
  const sub = query.data ?? null;
  return {
    ...query,
    subscription: sub,
    trialDaysLeft: sub?.status === "trialing" ? daysLeft(sub.trial_ends_at) : 0,
    allowed: hasAccess(sub),
  };
}
