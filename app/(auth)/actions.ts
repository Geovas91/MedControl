"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { defaultLocale, getMessages, isLocale, languageCookieName } from "@/config/i18n";
import { getAppBaseUrl, getSupabaseConfigError, hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function encodedParam(name: "error" | "message", value: string) {
  return `${name}=${encodeURIComponent(value)}`;
}

async function getAuthMessages() {
  const cookieStore = await cookies();
  const locale = cookieStore.get(languageCookieName)?.value;

  return getMessages(isLocale(locale) ? locale : defaultLocale).auth.messages;
}

export async function signInAction(formData: FormData) {
  const email = asString(formData.get("email"));
  const password = asString(formData.get("password"));

  if (!email || !password) {
    const messages = await getAuthMessages();
    redirect(`/login?${encodedParam("error", messages.missingCredentials)}`);
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
    const messages = await getAuthMessages();
    redirect(`/register?${encodedParam("error", messages.completeRequiredFields)}`);
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
  const messages = await getAuthMessages();
  redirect(
    `/login?${encodedParam(
      "message",
      data.session ? messages.accountCreated : messages.checkEmail
    )}`
  );
}

export async function signOutAction() {
  if (hasSupabaseConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  const messages = await getAuthMessages();
  redirect(`/login?${encodedParam("message", messages.signedOut)}`);
}
