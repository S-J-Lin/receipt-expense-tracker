import { timingSafeEqual } from "node:crypto";
import { logDbError } from "@/lib/errors";
import { createCronSupabaseClient } from "@/lib/supabase/cron";
import { berlinDate } from "@/lib/recurring-expenses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearerMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !bearerMatches(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const today = berlinDate();
  const { data, error } = await createCronSupabaseClient().rpc("process_due_recurring_expenses", { p_today: today, p_max_periods: 12 });
  if (error) {
    logDbError("cron recurring generation", error);
    return Response.json({ error: "Recurring expense generation failed and can be retried.", code: error.code ?? null }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
