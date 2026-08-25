import type { Database } from "@/types/database";
import type { PlanId, SubscriptionStatus } from "@/types/subscriptions";

export const ADMIN_PAGE_SIZE = 20;

export type AdminSearchParams = Record<string, string | string[] | undefined>;
export type TenantType = Database["public"]["Enums"]["tenant_type"];
export type ClinicMemberRole = Database["public"]["Enums"]["clinic_member_role"];
export type ClinicMemberStatus = Database["public"]["Enums"]["clinic_member_status"];
export type AdminBillingProvider = Database["public"]["Tables"]["clinic_subscriptions"]["Row"]["billing_provider"];

export type AdminClinicQuery = {
  page: number;
  search: string;
  tenantType: TenantType | null;
};

export type AdminMembershipQuery = {
  page: number;
  role: ClinicMemberRole | null;
  status: ClinicMemberStatus | null;
};

export type AdminSubscriptionQuery = {
  page: number;
  plan: PlanId | null;
  status: SubscriptionStatus | null;
  provider: AdminBillingProvider | null;
};

const tenantTypes: TenantType[] = ["customer", "demo", "qa", "internal", "development"];
const memberRoles: ClinicMemberRole[] = ["owner", "admin", "doctor", "assistant"];
const memberStatuses: ClinicMemberStatus[] = ["active", "invited", "suspended"];
const planIds: PlanId[] = ["basic", "plus", "pro"];
const subscriptionStatuses: SubscriptionStatus[] = ["inactive", "trialing", "active", "past_due", "cancelled"];
const billingProviders: AdminBillingProvider[] = ["paypal", "demo", "manual"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function enumValue<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return value && allowed.includes(value as T) ? (value as T) : null;
}

function pageValue(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

function normalizedSearch(value: string | undefined) {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function parseAdminClinicQuery(params: AdminSearchParams): AdminClinicQuery {
  return {
    page: pageValue(first(params.page)),
    search: normalizedSearch(first(params.q)),
    tenantType: enumValue(first(params.tenant), tenantTypes)
  };
}

export function parseAdminMembershipQuery(params: AdminSearchParams): AdminMembershipQuery {
  return {
    page: pageValue(first(params.page)),
    role: enumValue(first(params.role), memberRoles),
    status: enumValue(first(params.status), memberStatuses)
  };
}

export function parseAdminSubscriptionQuery(params: AdminSearchParams): AdminSubscriptionQuery {
  return {
    page: pageValue(first(params.page)),
    plan: enumValue(first(params.plan), planIds),
    status: enumValue(first(params.status), subscriptionStatuses),
    provider: enumValue(first(params.provider), billingProviders)
  };
}

export function getAdminPageCount(total: number) {
  return Math.max(1, Math.ceil(Math.max(0, total) / ADMIN_PAGE_SIZE));
}

export function clampAdminPage(page: number, total: number) {
  return Math.min(Math.max(1, page), getAdminPageCount(total));
}

export function getAdminPageRange(page: number) {
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  return { from, to: from + ADMIN_PAGE_SIZE - 1 };
}

export function buildAdminListHref(path: string, filters: Record<string, string | null>, page: number) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  if (page > 1) query.set("page", String(page));
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function escapeAdminIlike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function formatAdminDate(value: string | null) {
  if (!value) return "Sin registro";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export const tenantTypeLabels: Record<TenantType, string> = {
  customer: "Cliente",
  demo: "Demo",
  qa: "QA",
  internal: "Interna",
  development: "Desarrollo"
};

export const memberRoleLabels: Record<ClinicMemberRole, string> = {
  owner: "Owner de clínica",
  admin: "Admin de clínica",
  doctor: "Médico",
  assistant: "Asistente"
};

export const memberStatusLabels: Record<ClinicMemberStatus, string> = {
  active: "Activa",
  invited: "Invitada",
  suspended: "Suspendida"
};

export const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  inactive: "Inactiva",
  trialing: "Prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  cancelled: "Cancelada"
};

export const planLabels: Record<PlanId, string> = {
  basic: "CliniControl Básico",
  plus: "CliniControl Plus",
  pro: "CliniControl Pro"
};

export function getBillingProviderLabel(provider: AdminBillingProvider, hasProviderSubscription: boolean) {
  if (provider === "paypal") return hasProviderSubscription ? "PayPal" : "Sin proveedor asociado";
  if (provider === "demo") return "Demo controlada";
  return "Provisionamiento manual";
}
