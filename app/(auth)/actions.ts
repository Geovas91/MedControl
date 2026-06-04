"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAppBaseUrl, getSupabaseConfigError, hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function encodedParam(name: "error" | "message", value: string) {
  return `${name}=${encodeURIComponent(value)}`;
}

export async function signInAction(formData: FormData) {
  const email = asString(formData.get("email"));
  const password = asString(formData.get("password"));

  if (!email || !password) {
    redirect(`/login?${encodedParam("error", "Enter your email and password.")}`);
  }

  const configError = getSupabaseConfigError();
  if (configError) {
    redirect(`/login?${encodedParam("error", configError)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(`/login?${encodedParam("error", error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUpAction(formData: FormData) {
  const clinicName = asString(formData.get("clinic"));
  const fullName = asString(formData.get("full_name"));
  const email = asString(formData.get("email"));
  const password = asString(formData.get("password"));

  if (!clinicName || !fullName || !email || !password) {
    redirect(`/register?${encodedParam("error", "Complete all required fields.")}`);
  }

  const configError = getSupabaseConfigError();
  if (configError) {
    redirect(`/register?${encodedParam("error", configError)}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        clinic_name: clinicName,
        full_name: fullName
      },
      emailRedirectTo: `${getAppBaseUrl()}/auth/callback?next=/dashboard`
    }
  });

  if (error) {
    redirect(`/register?${encodedParam("error", error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(
    `/login?${encodedParam(
      "message",
      data.session ? "Account created. You can continue to the dashboard." : "Check your email to confirm your account."
    )}`
  );
}

export async function signOutAction() {
  if (hasSupabaseConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect(`/login?${encodedParam("message", "You have been signed out.")}`);
}
