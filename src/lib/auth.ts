import "server-only";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthorizationState = "authorized" | "unauthenticated" | "forbidden";

export function isAuthorizedUserId(id: string | undefined | null, allowed: string | undefined): boolean {
  return Boolean(id && allowed && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(allowed) && id === allowed);
}

export async function getAuthorization(): Promise<{ state: AuthorizationState; userId: string | null }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { state: "unauthenticated", userId: null };
  return isAuthorizedUserId(user.id, process.env.AUTHORIZED_USER_ID)
    ? { state: "authorized", userId: user.id }
    : { state: "forbidden", userId: null };
}

export async function requireAuthorizedUser(): Promise<string> {
  const result = await getAuthorization();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "forbidden" || !result.userId) throw new Error("Forbidden");
  return result.userId;
}
