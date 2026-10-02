"use server";

import { redirect } from "next/navigation";
import { isAuthorizedUserId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=invalid");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !isAuthorizedUserId(data.user?.id, process.env.AUTHORIZED_USER_ID)) {
    await supabase.auth.signOut();
    redirect("/login?error=invalid");
  }
  redirect("/");
}

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
