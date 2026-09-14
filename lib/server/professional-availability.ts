import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { getClinicDayRange } from "@/lib/dashboard/timezone";
import type { AvailabilityWeek } from "@/lib/availability/form";
import type { AvailabilityException } from "@/lib/availability/exceptions";
import { logger } from "@/lib/logger";

export type AvailabilityData = { clinic: { id: string; name: string; timezone: string }; role: string; canEdit: boolean; today: string; effectiveFrom: string; professionals: { id: string; name: string }[]; selectedProfessionalId: string; week: AvailabilityWeek };
const rpc = (client: Awaited<ReturnType<typeof createClient>>) => client as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> };

export async function getProfessionalAvailability(professionalId?: string): Promise<{ state: string; data?: AvailabilityData }> {
  const context = await getActiveTenantContext();
  if (context.state !== "ready") return { state: context.state };
  const client = await createClient(); const clinicId = context.tenant.clinic.id;
  const members = await client.from("clinic_members").select("id, role, user_id").eq("clinic_id", clinicId).eq("status", "active").in("role", ["owner", "doctor"]);
  if (members.error) return { state: "error" };
  const memberRows = (members.data ?? []) as unknown as { id: string }[];
  const ids = memberRows.map((m) => m.id); const allowed = ids.includes(professionalId ?? "") ? professionalId! : context.tenant.membership.role === "doctor" ? context.tenant.membership.id : ids[0];
  if (!allowed) return { state: "no_eligible" };
  const profiles = await client.from("doctor_public_profiles").select("profile_id, display_name, clinic_member_id").eq("clinic_id", clinicId);
  const profileRows = (profiles.data ?? []) as unknown as { clinic_member_id?: string | null; profile_id?: string | null; display_name: string }[];
  const names = new Map(profileRows.map((p) => [p.clinic_member_id ?? p.profile_id ?? "", p.display_name]));
  const today = getClinicDayRange(context.tenant.clinic.timezone).localDate; const week: AvailabilityWeek = {};
  const result = await rpc(client).rpc("get_professional_availability_week", { p_clinic_id: clinicId, p_clinic_member_id: allowed, p_effective_date: today });
  if (result.error) { logger.error("Professional availability week lookup failed", { component: "professional_availability", operation: "get_week", clinic_id: clinicId, role: context.tenant.membership.role, code: result.error.code ?? "rpc_error" }); return { state: "error" }; }
  for (let day = 1; day <= 7; day += 1) week[day] = [];
  for (const row of (result.data ?? []) as { weekday: number; start_time: string; end_time: string }[]) { if (Number.isInteger(row.weekday) && row.weekday >= 1 && row.weekday <= 7) week[row.weekday].push({ start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) }); }
  return { state: "ready", data: { clinic: context.tenant.clinic, role: context.tenant.membership.role, canEdit: ["owner", "admin", "doctor"].includes(context.tenant.membership.role), today, effectiveFrom: today, professionals: ids.map((id) => ({ id, name: names.get(id) ?? "Profesional" })), selectedProfessionalId: allowed, week } };
}

export async function saveProfessionalAvailability(input: { professionalId: string; effectiveFrom: string; week: AvailabilityWeek }) {
  const context = await getActiveTenantContext(); if (context.state !== "ready") return { state: context.state };
  const result = await rpc(await createClient()).rpc("save_professional_availability_for_current_user", { p_clinic_id: context.tenant.clinic.id, p_clinic_member_id: input.professionalId, p_effective_from: input.effectiveFrom, p_intervals: Object.entries(input.week).flatMap(([weekday, intervals]) => intervals.map((item) => ({ weekday: Number(weekday), start_time: item.start, end_time: item.end }))) });
  return result.error ? { state: "error", code: result.error.code } : { state: "success" };
}

export async function getProfessionalExceptions(clinicMemberId: string) {
  const context = await getActiveTenantContext(); if (context.state !== "ready") return { state: context.state as string, data: [] as AvailabilityException[] };
  const client = await createClient(); const result = await (client as unknown as { from: Function }).from("professional_availability_exceptions").select("id, clinic_member_id, exception_type, start_at, end_at, reason, is_active").eq("clinic_id", context.tenant.clinic.id).eq("clinic_member_id", clinicMemberId).eq("is_active", true).gte("end_at", new Date().toISOString()).order("start_at", { ascending: true });
  if (result.error) return { state: "error", data: [] as AvailabilityException[] };
  return { state: "ready", data: (result.data ?? []) as AvailabilityException[] };
}
