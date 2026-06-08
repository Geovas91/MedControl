import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type {
  ConsultationMode,
  DoctorPublicProfile,
  DoctorPublicProfileInsert,
  DoctorPublicProfileUpdate
} from "@/types/directory";

type DirectoryRowsResult = Promise<{ data: DoctorPublicProfile[] | null; error: PostgrestError | null }>;
type DirectorySingleResult = Promise<{ data: DoctorPublicProfile | null; error: PostgrestError | null }>;

type DirectorySelectBuilder = {
  eq(column: string, value: string | boolean): DirectorySelectBuilder;
  order(column: string, options: { ascending: boolean }): DirectoryRowsResult;
  maybeSingle(): DirectorySingleResult;
};

type DirectoryTableClient = {
  select(columns: "*"): DirectorySelectBuilder;
  update(values: DoctorPublicProfileUpdate): {
    eq(column: "id", value: string): {
      select(columns: "*"): {
        single(): DirectorySingleResult;
      };
    };
  };
  insert(values: DoctorPublicProfileInsert): {
    select(columns: "*"): {
      single(): DirectorySingleResult;
    };
  };
};

type DirectorySupabaseClient = {
  from(table: "doctor_public_profiles"): DirectoryTableClient;
};

export type DoctorPublicProfileFormInput = {
  clinicId: string;
  profileId: string;
  clinicMemberId: string;
  displayName: string;
  professionalTitle: string | null;
  specialty: string | null;
  subspecialty: string | null;
  professionalLicense: string | null;
  specialtyLicense: string | null;
  bio: string | null;
  yearsExperience: number | null;
  languages: string[];
  services: string[];
  consultationMode: ConsultationMode;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  whatsapp: string | null;
  publicEmail: string | null;
  websiteUrl: string | null;
  profileImageUrl: string | null;
  isPublished: boolean;
  acceptsNewPatients: boolean;
};

const consultationModes = ["presencial", "online", "hibrida"] as const;

export function isConsultationMode(value: string): value is ConsultationMode {
  return consultationModes.includes(value as ConsultationMode);
}

export function splitPublicList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function publicListToText(value: string[] | null | undefined) {
  return (value ?? []).join(", ");
}

export function sanitizePublicUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function slugifyDirectoryName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return normalized || "medico";
}

function stableProfileSlug(displayName: string, clinicMemberId: string) {
  return `${slugifyDirectoryName(displayName)}-${clinicMemberId.slice(0, 8)}`;
}

export async function getPublishedDoctorProfiles(search?: string) {
  const supabase = (await createClient()) as unknown as DirectorySupabaseClient;
  const { data, error } = await supabase
    .from("doctor_public_profiles")
    .select("*")
    .eq("is_published", true)
    .order("display_name", { ascending: true });

  const profiles = (data ?? []) as DoctorPublicProfile[];
  const normalizedSearch = search?.trim().toLowerCase();

  if (!normalizedSearch) {
    return { data: profiles, error };
  }

  return {
    data: profiles.filter((profile) =>
      [profile.display_name, profile.specialty, profile.subspecialty, profile.city, profile.state]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedSearch))
    ),
    error
  };
}

export async function getPublishedDoctorProfileBySlug(slug: string) {
  const supabase = (await createClient()) as unknown as DirectorySupabaseClient;
  const { data, error } = await supabase
    .from("doctor_public_profiles")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  return {
    data: (data as DoctorPublicProfile | null) ?? null,
    error
  };
}

export async function getClinicDoctorPublicProfiles(clinicId: string) {
  const supabase = (await createClient()) as unknown as DirectorySupabaseClient;
  const { data, error } = await supabase
    .from("doctor_public_profiles")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: true });

  return {
    data: (data ?? []) as DoctorPublicProfile[],
    error
  };
}

export async function getDoctorPublicProfileForClinicMember(clinicMemberId: string) {
  const supabase = (await createClient()) as unknown as DirectorySupabaseClient;
  const { data, error } = await supabase
    .from("doctor_public_profiles")
    .select("*")
    .eq("clinic_member_id", clinicMemberId)
    .maybeSingle();

  return {
    data: (data as DoctorPublicProfile | null) ?? null,
    error
  };
}

export async function createOrUpdateDoctorPublicProfile(input: DoctorPublicProfileFormInput) {
  const supabase = (await createClient()) as unknown as DirectorySupabaseClient;
  const currentProfileResult = await getDoctorPublicProfileForClinicMember(input.clinicMemberId);

  if (currentProfileResult.error) {
    return { data: null, error: currentProfileResult.error };
  }

  const baseValues = {
    clinic_id: input.clinicId,
    profile_id: input.profileId,
    clinic_member_id: input.clinicMemberId,
    display_name: input.displayName,
    professional_title: input.professionalTitle,
    specialty: input.specialty,
    subspecialty: input.subspecialty,
    professional_license: input.professionalLicense,
    specialty_license: input.specialtyLicense,
    bio: input.bio,
    years_experience: input.yearsExperience,
    languages: input.languages,
    services: input.services,
    consultation_mode: input.consultationMode,
    address_line: input.addressLine,
    city: input.city,
    state: input.state,
    country: "México",
    phone: input.phone,
    whatsapp: input.whatsapp,
    public_email: input.publicEmail,
    website_url: input.websiteUrl,
    profile_image_url: input.profileImageUrl,
    is_published: input.isPublished,
    accepts_new_patients: input.acceptsNewPatients
  } satisfies DoctorPublicProfileUpdate;

  if (currentProfileResult.data) {
    const { data, error } = await supabase
      .from("doctor_public_profiles")
      .update(baseValues)
      .eq("id", currentProfileResult.data.id)
      .select("*")
      .single();

    return {
      data: (data as DoctorPublicProfile | null) ?? null,
      error
    };
  }

  const insertValues = {
    ...baseValues,
    slug: stableProfileSlug(input.displayName, input.clinicMemberId)
  } satisfies DoctorPublicProfileInsert;

  const { data, error } = await supabase.from("doctor_public_profiles").insert(insertValues).select("*").single();

  return {
    data: (data as DoctorPublicProfile | null) ?? null,
    error
  };
}
