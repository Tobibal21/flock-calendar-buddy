/**
 * Daily log reminders. Called by the scheduler at 06:00 UTC (7:00 AM Lagos)
 * with {"slot":"morning"} and 17:00 UTC (6:00 PM Lagos) with {"slot":"evening"}.
 * Safe to replay: each slot is accepted only in its Lagos time window and
 * reminder_log allows one send per user, slot and day.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { slotAllowedNow } from "@/lib/push-config";

const Body = z.object({ slot: z.enum(["morning", "evening"]) });

export const Route = createFileRoute("/api/public/hooks/send-log-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "slot must be morning or evening" }, { status: 400 });
        const { slot } = parsed.data;
        if (!slotAllowedNow(slot)) return Response.json({ skipped: "outside time window" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendToUser } = await import("@/lib/webpush.server");

        const { data: users, error } = await supabaseAdmin.rpc("reminder_recipients", { p_slot: slot });
        if (error) return Response.json({ error: "lookup failed" }, { status: 500 });

        let sent = 0;
        for (const { user_id } of users ?? []) {
          // Claim the slot first; the unique index stops a second send today.
          const { data: claim } = await supabaseAdmin
            .from("reminder_log")
            .insert({ user_id, slot, result: "sending" })
            .select("id")
            .maybeSingle();
          if (!claim) continue;
          const r = await sendToUser(supabaseAdmin, user_id, slot);
          await supabaseAdmin.from("reminder_log").update({ result: r.result }).eq("id", claim.id);
          if (r.delivered) sent++;
        }
        return Response.json({ slot, users: users?.length ?? 0, sent });
      },
    },
  },
});
