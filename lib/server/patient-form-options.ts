import "server-only";

import { getClinicDayRange } from "@/lib/dashboard/timezone";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type PatientDoctorOption = {
  id: string;
  name: string;
};

type DoctorProfileRow = {
  profile_id: string | null;
  display_name: string;
};

export type PatientFormOptionsResult =
  | { state: "ready"; doctors: PatientDoctorOption[]; clinicToday: string; code: null }
  | { state: "timezone_error" | "doctor_options_error"; doctors: null; clinicToday: null; code: string | null };

export function getPatientClinicToday(timeZone: string) {
  try {
    return getClinicDayRange(timeZone).localDate;
  } catch {
    return null;
  }
}

export async function getPatientFormOptions(
  supabase: SupabaseClient,
  clinicId: string,
  timeZone: string
): Promise<PatientFormOptionsResult> {
  const clinicToday = getPatientClinicToday(timeZone);

  if (!clinicToday) {
    return { state: "timezone_error", doctors: null, clinicToday: null, code: null };
  }

  const doctorsResult = await supabase
    .from("doctor_public_profiles")
    .select("profile_id, display_name")
    .eq("clinic_id", clinicId)
    .not("profile_id", "is", null)
    .order("display_name", { ascending: true })
    .limit(100);

  if (doctorsResult.error) {
    return {
      state: "doctor_options_error",
      doctors: null,
      clinicToday: null,
      code: doctorsResult.error.code
    };
  }

  const doctors = ((doctorsResult.data ?? []) as DoctorProfileRow[])
    .filter((doctor): doctor is DoctorProfileRow & { profile_id: string } => Boolean(doctor.profile_id))
    .reduce<PatientDoctorOption[]>((options, doctor) => {
      if (!options.some((option) => option.id === doctor.profile_id)) {
        options.push({ id: doctor.profile_id, name: doctor.display_name });
      }

      return options;
    }, []);

  return { state: "ready", doctors, clinicToday, code: null };
}
