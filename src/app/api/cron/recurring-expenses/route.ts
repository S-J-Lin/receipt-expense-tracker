import { createSupabaseClient } from "@/lib/supabase/client";
import { berlinDate } from "@/lib/recurring-expenses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const today = berlinDate();
  const { data, error } = await createSupabaseClient().rpc("process_due_recurring_expenses", { p_today: today, p_max_periods: 12 });
  if (error) return Response.json({ error: "Recurring expense generation failed and can be retried.", detail: error.message }, { status: 500 });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}

