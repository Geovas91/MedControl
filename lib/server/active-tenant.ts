import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type ClinicRow = Tables["clinics"]["Row"];
type MembershipRow = Tables["clinic_members"]["Row"];

export type ActiveTenant = {
  clinic: Pick<ClinicRow, "id" | "name" | "timezone" | "tenant_type">;
  membership: Pick<MembershipRow, "id" | "clinic_id" | "role" | "status" | "created_at">;
  hasMultipleActiveMemberships: boolean;
  availableClinics: Array<Pick<ClinicRow, "id" | "name">>;
};

export type ActiveTenantContextResult =
  | { state: "ready"; user: User; tenant: ActiveTenant }
  | { state: "unauthenticated"; user: null; tenant: null }
  | { state: "no_active_membership"; user: User; tenant: null }
  | { state: "error"; user: User | null; tenant: null };

type ActiveMembership = Pick<MembershipRow, "id" | "clinic_id" | "role" | "status" | "created_at">;

export const getActiveTenantContext = cache(async (): Promise<ActiveTenantContextResult> => {
  if (!hasSupabaseConfig()) {
    logger.error("Active tenant configuration is unavailable", {
      component: "active_tenant",
      status: "configuration_error"
    });
    return { state: "error", user: null, tenant: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { state: "unauthenticated", user: null, tenant: null };
  }

  const { data: membershipData, error: membershipError } = await supabase
    .from("clinic_members")
    .select("id, clinic_id, role, status, created_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .order("clinic_id", { ascending: true });

  if (membershipError) {
    logger.error("Active tenant membership query failed", {
      component: "active_tenant",
      status: "membership_query_error",
      code: membershipError.code
    });
    return { state: "error", user, tenant: null };
  }

  const memberships = (membershipData ?? []) as ActiveMembership[];
  const selectedClinicId = (await cookies()).get("clinicontrol_active_clinic")?.value;
  const membership = memberships.find((item) => item.clinic_id === selectedClinicId) ?? memberships[0];

  if (!membership) {
    return { state: "no_active_membership", user, tenant: null };
  }

  const { data: clinicData, error: clinicError } = await supabase
    .from("clinics")
    .select("id, name, timezone, tenant_type")
    .eq("id", membership.clinic_id)
    .maybeSingle();

  if (clinicError || !clinicData) {
    logger.error("Active tenant clinic query failed", {
      component: "active_tenant",
      status: "clinic_query_error",
      code: clinicError?.code ?? "missing_clinic"
    });
    return { state: "error", user, tenant: null };
  }

  const { data: availableClinicData, error: availableClinicError } = await supabase
    .from("clinics")
    .select("id, name")
    .in("id", memberships.map((item) => item.clinic_id))
    .order("name", { ascending: true });

  if (availableClinicError) {
    logger.error("Active tenant clinic list query failed", {
      component: "active_tenant",
      status: "clinic_list_query_error",
      code: availableClinicError.code
    });
    return { state: "error", user, tenant: null };
  }

  return {
    state: "ready",
    user,
    tenant: {
      clinic: clinicData,
      membership,
      hasMultipleActiveMemberships: memberships.length > 1,
      availableClinics: availableClinicData ?? []
    }
  };
});
