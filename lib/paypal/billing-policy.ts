export type BillingActor = { userId: string; clinicId: string };
export type BillingIntent = {
  id: string; user_id: string; clinic_id: string; plan_id: string; provider_plan_id: string;
  provider_subscription_id: string | null; status: "pending" | "completed";
  expires_at: string;
};

export class BillingError extends Error {
  readonly status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}

export function canManageBilling(role: string) { return role === "owner"; }

export function authorizeBillingActor(input: {
  userId?: string; clinicId?: string; membershipClinicId?: string; role?: string;
  membershipStatus?: string; selectedClinicId?: string; multiple?: boolean;
}): BillingActor {
  if (!input.userId) throw new BillingError(401, "authentication_required");
  if (!input.clinicId || input.membershipClinicId !== input.clinicId || input.membershipStatus !== "active"
    || !canManageBilling(input.role ?? "") || (input.multiple && !input.selectedClinicId)
    || (input.selectedClinicId && input.selectedClinicId !== input.clinicId)) {
    throw new BillingError(403, "billing_owner_required");
  }
  return { userId: input.userId, clinicId: input.clinicId };
}

export function validateBillingIntent(intent: BillingIntent | null, actor: BillingActor, input: {
  intentId: string; planId: string; subscriptionId: string;
}, now = Date.now()) {
  if (!intent || intent.id !== input.intentId || intent.user_id !== actor.userId || intent.clinic_id !== actor.clinicId
    || intent.plan_id !== input.planId || intent.provider_subscription_id !== input.subscriptionId
    || !["pending", "completed"].includes(intent.status)
    || (intent.status === "pending" && (!Number.isFinite(Date.parse(intent.expires_at)) || Date.parse(intent.expires_at) <= now))) {
    throw new BillingError(403, "invalid_billing_intent");
  }
  return intent;
}

export type ProviderSubscription = {
  id: string; plan_id?: string; custom_id?: string; status?: string;
  start_time?: string; billing_info?: { next_billing_time?: string };
};

export function validateProviderApproval(intent: BillingIntent, details: ProviderSubscription) {
  if (details.id !== intent.provider_subscription_id || details.plan_id !== intent.provider_plan_id
    || details.custom_id !== intent.id || !["ACTIVE", "APPROVED"].includes(details.status ?? "")) {
    throw new BillingError(409, "provider_subscription_mismatch");
  }
}
