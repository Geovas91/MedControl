"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAppBaseUrl, getSupabaseConfigError, hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { buildAuthRedirect, getSafeLocalPath, isInvitationPath } from "@/lib/auth/redirects";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function signInAction(formData: FormData) {
  const email = asString(formData.get("email"));
  const password = asString(formData.get("password"));
  const next = getSafeLocalPath(asString(formData.get("next")), "");

  if (!email || !password) {
    redirect(buildAuthRedirect("/login", { next, error: "Enter your email and password." }));
  }

  const configError = getSupabaseConfigError();
  if (configError) {
    redirect(buildAuthRedirect("/login", { next, error: configError }));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(buildAuthRedirect("/login", { next, error: error.message }));
  }

  revalidatePath("/", "layout");
  redirect(next || "/dashboard");
}

export async function signUpAction(formData: FormData) {
  const clinicName = asString(formData.get("clinic"));
  const fullName = asString(formData.get("full_name"));
  const email = asString(formData.get("email"));
  const password = asString(formData.get("password"));
  const next = getSafeLocalPath(asString(formData.get("next")), "");
  const invitationRegistration = isInvitationPath(next);

  if ((!invitationRegistration && !clinicName) || !fullName || !email || !password) {
    redirect(buildAuthRedirect("/register", { next, error: "Complete all required fields." }));
  }

  const configError = getSupabaseConfigError();
  if (configError) {
    redirect(buildAuthRedirect("/register", { next, error: configError }));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: invitationRegistration ? { full_name: fullName } : { clinic_name: clinicName, full_name: fullName },
      emailRedirectTo: `${getAppBaseUrl()}/auth/callback?next=${encodeURIComponent(next || "/dashboard")}`
    }
  });

  if (error) {
    redirect(buildAuthRedirect("/register", { next, error: error.message }));
  }

  revalidatePath("/", "layout");
  redirect(buildAuthRedirect("/login", {
    next,
    message: data.session ? "Account created. You can continue." : "Check your email to confirm your account."
  }));
}

export async function signOutAction() {
  if (hasSupabaseConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect(buildAuthRedirect("/login", { message: "You have been signed out." }));
}

export async function requestPasswordRecoveryAction(formData: FormData) {
  const email = asString(formData.get("email"));
  const next = getSafeLocalPath(asString(formData.get("next")), "");
  if (email && hasSupabaseConfig()) {
    const supabase = await createClient();
    const resetPath = buildAuthRedirect("/reset-password", { next });
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppBaseUrl()}/auth/callback?next=${encodeURIComponent(resetPath)}`
    });
  }
  redirect(buildAuthRedirect("/forgot-password", { next, message: "Si existe una cuenta para ese correo, recibirás instrucciones para continuar." }));
}

export async function updatePasswordAction(formData: FormData) {
  const password = asString(formData.get("password"));
  const confirmation = asString(formData.get("confirmation"));
  const next = getSafeLocalPath(asString(formData.get("next")), "");
  if (password.length < 8 || password !== confirmation) {
    redirect(buildAuthRedirect("/reset-password", { next, error: "Usa una contraseña de al menos 8 caracteres y confirma el mismo valor." }));
  }
  if (!hasSupabaseConfig()) {
    redirect(buildAuthRedirect("/reset-password", { next, error: "La configuración de autenticación no está disponible." }));
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(buildAuthRedirect("/login", { next, message: "Tu enlace de recuperación expiró. Solicita uno nuevo." }));
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(buildAuthRedirect("/reset-password", { next, error: "No fue posible actualizar la contraseña. Solicita un enlace nuevo." }));
  redirect(buildAuthRedirect("/login", { next, message: "Tu contraseña fue actualizada. Inicia sesión." }));
}
