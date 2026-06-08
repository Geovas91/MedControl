import type { Database } from "@/types/database";

export type ConsultationMode = "presencial" | "online" | "hibrida";
export type DoctorPublicProfile = Database["public"]["Tables"]["doctor_public_profiles"]["Row"];
export type DoctorPublicProfileInsert = Database["public"]["Tables"]["doctor_public_profiles"]["Insert"];
export type DoctorPublicProfileUpdate = Database["public"]["Tables"]["doctor_public_profiles"]["Update"];
