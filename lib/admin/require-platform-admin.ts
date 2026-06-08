import { notFound, redirect } from "next/navigation";
import { getSupabaseConfigError } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function requirePlatformAdmin() {
  const configError = getSupabaseConfigError();

  if (configError) {
    redirect(`/login?error=${encodeURIComponent(configError)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: isPlatformAdmin, error } = await supabase.rpc("is_platform_admin");

  if (error) {
    notFound();
  }

  if (!isPlatformAdmin) {
    redirect("/dashboard");
  }

  return user;
}
