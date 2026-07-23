import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";
import type { PostgrestError, User } from "@supabase/supabase-js";

type Tables = Database["public"]["Tables"];

export type ProfileRow = Tables["profiles"]["Row"];
export type ClinicMembershipRow = Tables["clinic_members"]["Row"];

type OnboardingRpcClient = {
  rpc(
    fn: "complete_clinic_onboarding_for_current_user",
    args: {
      p_clinic_name: string; p_legal_name: string | null; p_phone: string | null; p_clinic_email: string | null;
      p_timezone: string; p_country: string | null; p_region: string | null; p_address: string | null;
      p_owner_full_name: string; p_plan_id: "basic" | "plus" | "pro";
      p_accepted_terms: boolean; p_accepted_privacy: boolean; p_accepted_clinical_responsibility: boolean;
    }
  ): Promise<{ data: string | null; error: PostgrestError | null }>;
};

export type ClinicOnboardingInput = {
  clinicName: string; legalName: string | null; phone: string | null; clinicEmail: string | null; timezone: string;
  country: string | null; region: string | null; address: string | null; ownerFullName: string; planId: "basic" | "plus" | "pro";
  acceptedTerms: boolean; acceptedPrivacy: boolean; acceptedClinicalResponsibility: boolean;
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
    .eq("status", "active")
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

export async function completeClinicOnboardingForCurrentUser(input: ClinicOnboardingInput) {
  const { user, error: profileError } = await ensureProfileForCurrentUser();

  if (profileError || !user) {
    return { clinicId: null, error: profileError ?? new Error("Authentication required.") };
  }

  const { membership } = await getCurrentUserClinicMembership();

  if (membership) {
    return { clinicId: membership.clinic_id, error: null };
  }

  const supabase = await createClient();
  const onboardingRpcClient = supabase as unknown as OnboardingRpcClient;
  const { data: clinicId, error } = await onboardingRpcClient.rpc("complete_clinic_onboarding_for_current_user", {
    p_clinic_name: input.clinicName, p_legal_name: input.legalName, p_phone: input.phone, p_clinic_email: input.clinicEmail,
    p_timezone: input.timezone, p_country: input.country, p_region: input.region, p_address: input.address,
    p_owner_full_name: input.ownerFullName, p_plan_id: input.planId,
    p_accepted_terms: input.acceptedTerms, p_accepted_privacy: input.acceptedPrivacy,
    p_accepted_clinical_responsibility: input.acceptedClinicalResponsibility
  });

  return {
    clinicId: clinicId ?? null,
    error
  };
}
