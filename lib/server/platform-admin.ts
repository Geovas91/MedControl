import "server-only";

import { logger } from "@/lib/logger";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import {
  ADMIN_PAGE_SIZE,
  clampAdminPage,
  escapeAdminIlike,
  getAdminPageCount,
  getAdminPageRange,
  getBillingProviderLabel,
  type AdminClinicQuery,
  type AdminMembershipQuery,
  type AdminSubscriptionQuery,
  type ClinicMemberRole,
  type ClinicMemberStatus,
  type TenantType
} from "@/lib/admin/query";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanId, SubscriptionStatus } from "@/types/subscriptions";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type ClinicRow = Tables["clinics"]["Row"];
type MembershipRow = Tables["clinic_members"]["Row"];
type ProfileRow = Tables["profiles"]["Row"];
type SubscriptionRow = Tables["clinic_subscriptions"]["Row"];
type ClinicSummaryRow = Pick<ClinicRow, "id" | "name" | "tenant_type" | "created_at">;
type ClinicLookupRow = Pick<ClinicRow, "id" | "name" | "tenant_type">;
type MembershipSummaryRow = Pick<MembershipRow, "id" | "clinic_id" | "user_id" | "role" | "status" | "created_at">;
type ProfileSummaryRow = Pick<ProfileRow, "id" | "full_name" | "email">;
type SubscriptionSummaryRow = Pick<SubscriptionRow, "clinic_id" | "plan_id" | "status">;
type SubscriptionAdminRow = Pick<SubscriptionRow, "id" | "clinic_id" | "plan_id" | "status" | "billing_provider" | "current_period_end" | "cancel_at_period_end" | "created_at">;

type AdminDataResult<T> = { state: "ready"; data: T } | { state: "error"; data: null };

export type PlatformAdminMetric = {
  label: string;
  value: number;
  detail: string;
};

export type PlatformAdminRecentClinic = {
  id: string;
  name: string;
  tenantType: TenantType;
  planId: PlanId | null;
  subscriptionStatus: SubscriptionStatus | null;
  createdAt: string;
};

export type PlatformAdminOverview = {
  metrics: PlatformAdminMetric[];
  planDistribution: Array<{ planId: PlanId; total: number }>;
  statusDistribution: Array<{ status: SubscriptionStatus; total: number }>;
  recentClinics: PlatformAdminRecentClinic[];
};

export type PlatformAdminClinic = {
  id: string;
  name: string;
  tenantType: TenantType;
  planId: PlanId | null;
  subscriptionStatus: SubscriptionStatus | null;
  memberCount: number;
  createdAt: string;
};

export type PlatformAdminMembership = {
  id: string;
  fullName: string | null;
  email: string | null;
  clinicName: string;
  tenantType: TenantType;
  role: ClinicMemberRole;
  status: ClinicMemberStatus;
  createdAt: string;
};

export type PlatformAdminSubscription = {
  id: string;
  clinicName: string;
  tenantType: TenantType;
  planId: PlanId;
  status: SubscriptionStatus;
  providerLabel: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
};

async function authorizedAdminClient() {
  // This check must complete before service-role access. Clinic owner/admin roles do not satisfy it.
  await requirePlatformAdmin();
  return createAdminClient();
}

function queryFailed(component: string, codes: Array<string | undefined>) {
  logger.error("Platform admin data query failed", {
    component,
    status: "data_query_error",
    codes: codes.filter(Boolean)
  });
}

export async function getPlatformAdminOverview(): Promise<AdminDataResult<PlatformAdminOverview>> {
  const admin = await authorizedAdminClient();
  const [
    clinics,
    demoClinics,
    activeMemberships,
    activeDoctorMemberships,
    entitledSubscriptions,
    basicPlans,
    plusPlans,
    proPlans,
    inactiveSubscriptions,
    trialingSubscriptions,
    activeSubscriptions,
    pastDueSubscriptions,
    cancelledSubscriptions,
    recentClinics
  ] = await Promise.all([
    admin.from("clinics").select("id", { count: "exact", head: true }),
    admin.from("clinics").select("id", { count: "exact", head: true }).eq("tenant_type", "demo"),
    admin.from("clinic_members").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("clinic_members").select("id", { count: "exact", head: true }).eq("status", "active").eq("role", "doctor"),
    admin.from("clinic_subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing"]),
    admin.from("clinic_subscriptions").select("id", { count: "exact", head: true }).eq("plan_id", "basic"),
    admin.from("clinic_subscriptions").select("id", { count: "exact", head: true }).eq("plan_id", "plus"),
    admin.from("clinic_subscriptions").select("id", { count: "exact", head: true }).eq("plan_id", "pro"),
    admin.from("clinic_subscriptions").select("id", { count: "exact", head: true }).eq("status", "inactive"),
    admin.from("clinic_subscriptions").select("id", { count: "exact", head: true }).eq("status", "trialing"),
    admin.from("clinic_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("clinic_subscriptions").select("id", { count: "exact", head: true }).eq("status", "past_due"),
    admin.from("clinic_subscriptions").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
    admin.from("clinics").select("id, name, tenant_type, created_at").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(5)
  ]);

  const errors = [clinics.error, demoClinics.error, activeMemberships.error, activeDoctorMemberships.error, entitledSubscriptions.error, basicPlans.error, plusPlans.error, proPlans.error, inactiveSubscriptions.error, trialingSubscriptions.error, activeSubscriptions.error, pastDueSubscriptions.error, cancelledSubscriptions.error, recentClinics.error];
  if (errors.some(Boolean)) {
    queryFailed("platform_admin_overview", errors.map((error) => error?.code));
    return { state: "error", data: null };
  }

  const recentRows = (recentClinics.data ?? []) as ClinicSummaryRow[];
  const recentIds = recentRows.map((clinic) => clinic.id);
  const subscriptionResult = recentIds.length
    ? await admin.from("clinic_subscriptions").select("clinic_id, plan_id, status").in("clinic_id", recentIds)
    : { data: [], error: null };

  if (subscriptionResult.error) {
    queryFailed("platform_admin_overview", [subscriptionResult.error.code]);
    return { state: "error", data: null };
  }

  const subscriptionsByClinic = new Map(((subscriptionResult.data ?? []) as SubscriptionSummaryRow[]).map((subscription) => [subscription.clinic_id, subscription]));

  return {
    state: "ready",
    data: {
      metrics: [
        { label: "Clínicas registradas", value: clinics.count ?? 0, detail: "Tenants administrativos en la plataforma" },
        { label: "Clínicas demo", value: demoClinics.count ?? 0, detail: "Clasificación operativa, no acceso clínico" },
        { label: "Membresías activas", value: activeMemberships.count ?? 0, detail: "Relaciones usuario-clínica activas" },
        { label: "Membresías médicas", value: activeDoctorMemberships.count ?? 0, detail: "Roles de médico activos por clínica" },
        { label: "Suscripciones con acceso", value: entitledSubscriptions.count ?? 0, detail: "Estados active o trialing" }
      ],
      planDistribution: [
        { planId: "basic", total: basicPlans.count ?? 0 },
        { planId: "plus", total: plusPlans.count ?? 0 },
        { planId: "pro", total: proPlans.count ?? 0 }
      ],
      statusDistribution: [
        { status: "inactive", total: inactiveSubscriptions.count ?? 0 },
        { status: "trialing", total: trialingSubscriptions.count ?? 0 },
        { status: "active", total: activeSubscriptions.count ?? 0 },
        { status: "past_due", total: pastDueSubscriptions.count ?? 0 },
        { status: "cancelled", total: cancelledSubscriptions.count ?? 0 }
      ],
      recentClinics: recentRows.map((clinic) => {
        const subscription = subscriptionsByClinic.get(clinic.id);
        return {
          id: clinic.id,
          name: clinic.name,
          tenantType: clinic.tenant_type,
          planId: subscription?.plan_id ?? null,
          subscriptionStatus: subscription?.status ?? null,
          createdAt: clinic.created_at
        };
      })
    }
  };
}

export async function getPlatformAdminClinics(query: AdminClinicQuery): Promise<AdminDataResult<{
  query: AdminClinicQuery;
  rows: PlatformAdminClinic[];
  page: number;
  pageCount: number;
  total: number;
}>> {
  const admin = await authorizedAdminClient();
  let countQuery = admin.from("clinics").select("id", { count: "exact", head: true });
  if (query.tenantType) countQuery = countQuery.eq("tenant_type", query.tenantType);
  if (query.search) countQuery = countQuery.ilike("name", `%${escapeAdminIlike(query.search)}%`);
  const countResult = await countQuery;

  if (countResult.error) {
    queryFailed("platform_admin_clinics", [countResult.error.code]);
    return { state: "error", data: null };
  }

  const total = countResult.count ?? 0;
  const page = clampAdminPage(query.page, total);
  const { from, to } = getAdminPageRange(page);
  let rowsQuery = admin.from("clinics").select("id, name, tenant_type, created_at");
  if (query.tenantType) rowsQuery = rowsQuery.eq("tenant_type", query.tenantType);
  if (query.search) rowsQuery = rowsQuery.ilike("name", `%${escapeAdminIlike(query.search)}%`);
  const rowsResult = await rowsQuery.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);

  if (rowsResult.error) {
    queryFailed("platform_admin_clinics", [rowsResult.error.code]);
    return { state: "error", data: null };
  }

  const clinics = (rowsResult.data ?? []) as ClinicSummaryRow[];
  const clinicIds = clinics.map((clinic) => clinic.id);
  const subscriptionResult = clinicIds.length
    ? await admin.from("clinic_subscriptions").select("clinic_id, plan_id, status").in("clinic_id", clinicIds)
    : { data: [], error: null };
  const memberCountResults = await Promise.all(clinicIds.map((clinicId) =>
    admin.from("clinic_members").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId)
  ));

  if (subscriptionResult.error || memberCountResults.some((result) => result.error)) {
    queryFailed("platform_admin_clinics", [subscriptionResult.error?.code, ...memberCountResults.map((result) => result.error?.code)]);
    return { state: "error", data: null };
  }

  const subscriptionsByClinic = new Map(((subscriptionResult.data ?? []) as SubscriptionSummaryRow[]).map((subscription) => [subscription.clinic_id, subscription]));
  const countsByClinic = new Map(clinicIds.map((clinicId, index) => [clinicId, memberCountResults[index]?.count ?? 0]));

  return {
    state: "ready",
    data: {
      query: { ...query, page },
      rows: clinics.map((clinic) => {
        const subscription = subscriptionsByClinic.get(clinic.id);
        return {
          id: clinic.id,
          name: clinic.name,
          tenantType: clinic.tenant_type,
          planId: subscription?.plan_id ?? null,
          subscriptionStatus: subscription?.status ?? null,
          memberCount: countsByClinic.get(clinic.id) ?? 0,
          createdAt: clinic.created_at
        };
      }),
      page,
      pageCount: getAdminPageCount(total),
      total
    }
  };
}

export async function getPlatformAdminMemberships(query: AdminMembershipQuery): Promise<AdminDataResult<{
  query: AdminMembershipQuery;
  rows: PlatformAdminMembership[];
  page: number;
  pageCount: number;
  total: number;
}>> {
  const admin = await authorizedAdminClient();
  let countQuery = admin.from("clinic_members").select("id", { count: "exact", head: true });
  if (query.role) countQuery = countQuery.eq("role", query.role);
  if (query.status) countQuery = countQuery.eq("status", query.status);
  const countResult = await countQuery;

  if (countResult.error) {
    queryFailed("platform_admin_memberships", [countResult.error.code]);
    return { state: "error", data: null };
  }

  const total = countResult.count ?? 0;
  const page = clampAdminPage(query.page, total);
  const { from, to } = getAdminPageRange(page);
  let rowsQuery = admin.from("clinic_members").select("id, clinic_id, user_id, role, status, created_at");
  if (query.role) rowsQuery = rowsQuery.eq("role", query.role);
  if (query.status) rowsQuery = rowsQuery.eq("status", query.status);
  const rowsResult = await rowsQuery.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);

  if (rowsResult.error) {
    queryFailed("platform_admin_memberships", [rowsResult.error.code]);
    return { state: "error", data: null };
  }

  const memberships = (rowsResult.data ?? []) as MembershipSummaryRow[];
  const userIds = Array.from(new Set(memberships.map((membership) => membership.user_id)));
  const clinicIds = Array.from(new Set(memberships.map((membership) => membership.clinic_id)));
  const [profilesResult, clinicsResult] = await Promise.all([
    userIds.length ? admin.from("profiles").select("id, full_name, email").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    clinicIds.length ? admin.from("clinics").select("id, name, tenant_type").in("id", clinicIds) : Promise.resolve({ data: [], error: null })
  ]);

  if (profilesResult.error || clinicsResult.error) {
    queryFailed("platform_admin_memberships", [profilesResult.error?.code, clinicsResult.error?.code]);
    return { state: "error", data: null };
  }

  const profilesById = new Map(((profilesResult.data ?? []) as ProfileSummaryRow[]).map((profile) => [profile.id, profile]));
  const clinicsById = new Map(((clinicsResult.data ?? []) as ClinicLookupRow[]).map((clinic) => [clinic.id, clinic]));

  return {
    state: "ready",
    data: {
      query: { ...query, page },
      rows: memberships.map((membership) => {
        const profile = profilesById.get(membership.user_id);
        const clinic = clinicsById.get(membership.clinic_id);
        return {
          id: membership.id,
          fullName: profile?.full_name ?? null,
          email: profile?.email ?? null,
          clinicName: clinic?.name ?? "Clínica no disponible",
          tenantType: clinic?.tenant_type ?? "customer",
          role: membership.role,
          status: membership.status,
          createdAt: membership.created_at
        };
      }),
      page,
      pageCount: getAdminPageCount(total),
      total
    }
  };
}

export async function getPlatformAdminSubscriptions(query: AdminSubscriptionQuery): Promise<AdminDataResult<{
  query: AdminSubscriptionQuery;
  rows: PlatformAdminSubscription[];
  page: number;
  pageCount: number;
  total: number;
}>> {
  const admin = await authorizedAdminClient();
  let countQuery = admin.from("clinic_subscriptions").select("id", { count: "exact", head: true });
  if (query.plan) countQuery = countQuery.eq("plan_id", query.plan);
  if (query.status) countQuery = countQuery.eq("status", query.status);
  if (query.provider) countQuery = countQuery.eq("billing_provider", query.provider);
  const countResult = await countQuery;

  if (countResult.error) {
    queryFailed("platform_admin_subscriptions", [countResult.error.code]);
    return { state: "error", data: null };
  }

  const total = countResult.count ?? 0;
  const page = clampAdminPage(query.page, total);
  const { from, to } = getAdminPageRange(page);
  let rowsQuery = admin.from("clinic_subscriptions").select("id, clinic_id, plan_id, status, billing_provider, current_period_end, cancel_at_period_end, created_at");
  if (query.plan) rowsQuery = rowsQuery.eq("plan_id", query.plan);
  if (query.status) rowsQuery = rowsQuery.eq("status", query.status);
  if (query.provider) rowsQuery = rowsQuery.eq("billing_provider", query.provider);
  const rowsResult = await rowsQuery.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);

  if (rowsResult.error) {
    queryFailed("platform_admin_subscriptions", [rowsResult.error.code]);
    return { state: "error", data: null };
  }

  const subscriptions = (rowsResult.data ?? []) as SubscriptionAdminRow[];
  const clinicIds = Array.from(new Set(subscriptions.map((subscription) => subscription.clinic_id)));
  const paypalSubscriptionIds = subscriptions
    .filter((subscription) => subscription.billing_provider === "paypal")
    .map((subscription) => subscription.id);
  const [clinicsResult, providerBackedResult] = await Promise.all([
    clinicIds.length
      ? admin.from("clinics").select("id, name, tenant_type").in("id", clinicIds)
      : Promise.resolve({ data: [], error: null }),
    paypalSubscriptionIds.length
      ? admin.from("clinic_subscriptions").select("id").in("id", paypalSubscriptionIds).not("provider_subscription_id", "is", null)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (clinicsResult.error || providerBackedResult.error) {
    queryFailed("platform_admin_subscriptions", [clinicsResult.error?.code, providerBackedResult.error?.code]);
    return { state: "error", data: null };
  }

  const clinicsById = new Map(((clinicsResult.data ?? []) as ClinicLookupRow[]).map((clinic) => [clinic.id, clinic]));
  const providerBackedIds = new Set(((providerBackedResult.data ?? []) as Array<{ id: string }>).map((subscription) => subscription.id));

  return {
    state: "ready",
    data: {
      query: { ...query, page },
      rows: subscriptions.map((subscription) => {
        const clinic = clinicsById.get(subscription.clinic_id);
        return {
          id: subscription.id,
          clinicName: clinic?.name ?? "Clínica no disponible",
          tenantType: clinic?.tenant_type ?? "customer",
          planId: subscription.plan_id,
          status: subscription.status,
          providerLabel: getBillingProviderLabel(subscription.billing_provider, providerBackedIds.has(subscription.id)),
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          createdAt: subscription.created_at
        };
      }),
      page,
      pageCount: getAdminPageCount(total),
      total
    }
  };
}

export const PLATFORM_ADMIN_PAGE_SIZE = ADMIN_PAGE_SIZE;
