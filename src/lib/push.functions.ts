import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sends a test reminder to the signed-in user's own devices. */
export const sendTestReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendToUser } = await import("@/lib/webpush.server");
    const r = await sendToUser(supabaseAdmin, context.userId, "test");
    await supabaseAdmin.from("reminder_log").insert({ user_id: context.userId, slot: "test", result: r.result });
    return r;
  });
