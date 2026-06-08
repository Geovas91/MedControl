import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";
import type { PostgrestError, User } from "@supabase/supabase-js";

type Tables = Database["public"]["Tables"];

export type ProfileRow = Tables["profiles"]["Row"];
export type ClinicMembershipRow = Tables["clinic_members"]["Row"];

type OnboardingRpcClient = {
  rpc(
    fn: "create_personal_clinic_for_current_user",
    args: { clinic_name: string; full_name: string | null; email: string | null }
  ): Promise<{ data: string | null; error: PostgrestError | null }>;
};

export type OnboardingStatus =
  | {
      state: "unauthenticated";
      user: null;
      profile: null;
      membership: null;
    }
  | {
      state: "missing_profile";
      user: User;
      profile: null;
      membership: null;
    }
  | {
      state: "missing_clinic";
      user: User;
      profile: ProfileRow;
      membership: null;
    }
  | {
      state: "complete";
      user: User;
      profile: ProfileRow;
      membership: ClinicMembershipRow;
    };

function metadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function personalClinicName(fullName: string | null) {
  return fullName ? `Consultorio de ${fullName}` : "Mi consultorio";
}

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, profile: null, error: userError };
  }

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const profile = data as ProfileRow | null;

  return { user, profile: profile ?? null, error };
}

export async function getCurrentUserClinicMembership() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, membership: null, error: userError };
  }

  const { data, error } = await supabase
    .from("clinic_members")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const membership = data as ClinicMembershipRow | null;

  return { user, membership: membership ?? null, error };
}

async function ensureProfileForCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, profile: null, error: userError ?? new Error("Authentication required.") };
  }

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const profile = data as ProfileRow | null;

  return { user, profile: profile ?? null, error };
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  if (!hasSupabaseConfig()) {
    return {
      state: "unauthenticated",
      user: null,
      profile: null,
      membership: null
    };
  }

  const { user, profile } = await getCurrentUserProfile();

  if (!user) {
    return {
      state: "unauthenticated",
      user: null,
      profile: null,
      membership: null
    };
  }

  if (!profile) {
    return {
      state: "missing_profile",
      user,
      profile: null,
      membership: null
    };
  }

  const { membership } = await getCurrentUserClinicMembership();

  if (!membership) {
    return {
      state: "missing_clinic",
      user,
      profile,
      membership: null
    };
  }

  return {
    state: "complete",
    user,
    profile,
    membership
  };
}

export async function ensurePersonalClinicForCurrentUser(clinicName?: string) {
  const { user, profile, error: profileError } = await ensureProfileForCurrentUser();

  if (profileError || !user) {
    return { clinicId: null, error: profileError ?? new Error("Authentication required.") };
  }

  const { membership } = await getCurrentUserClinicMembership();

  if (membership) {
    return { clinicId: membership.clinic_id, error: null };
  }

  const supabase = await createClient();
  const fullName = profile?.full_name ?? metadataString(user.user_metadata.full_name);
  const fallbackName = personalClinicName(fullName);
  const onboardingRpcClient = supabase as unknown as OnboardingRpcClient;
  const { data: clinicId, error } = await onboardingRpcClient.rpc("create_personal_clinic_for_current_user", {
    clinic_name: clinicName?.trim() || fallbackName,
    full_name: fullName,
    email: user.email ?? null
  });

  return {
    clinicId: clinicId ?? null,
    error
  };
}
