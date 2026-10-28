export type BillingActor = { userId: string; clinicId: string };
export type BillingIntent = {
  id: string; user_id: string; clinic_id: string; plan_id: string; provider_plan_id: string;
  provider_subscription_id: string | null; status: "pending" | "completed";
  expires_at: string;
  creation_dispatched_at?: string | null;
};

export class BillingError extends Error {
  readonly status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}

export function billingErrorMessage(code: string) {
  const messages: Record<string, string> = {
    billing_subscription_exists: "La clínica ya tiene una suscripción. No se creará otra. Los cambios de plan requieren una gestión separada.",
    billing_intent_in_progress: "Ya hay una solicitud de suscripción en curso. Continúa con el plan elegido o espera su verificación.",
    billing_operation_conflict: "Ya hay una operación de facturación en curso. Recarga la página para verificar su estado.",
    billing_creation_unknown: "El resultado de una solicitud anterior está pendiente de verificación. No se iniciará otra suscripción. Contacta a soporte.",
    billing_reconciliation_required: "Hay una operación anterior que necesita revisión. No se creará otra suscripción. Contacta a soporte."
  };
  return messages[code] ?? "No se pudo completar la operación de facturación.";
}

type CreationSnapshot = Pick<BillingIntent, "status" | "plan_id" | "provider_subscription_id" | "expires_at" | "creation_dispatched_at">;
export type BillingCreationAvailability = { code: string; resumePlan: string | null };

/** Presentation only. SQL independently enforces the same checks on every write. */
export function billingCreationAvailability(subscription: { status: string; provider_subscription_id: string | null } | null, intents: CreationSnapshot[], now = Date.now()): BillingCreationAvailability {
  const blocked = (code: string) => ({ code, resumePlan: null });
  if (subscription && (["active", "past_due"].includes(subscription.status) || subscription.provider_subscription_id !== null)) return blocked("billing_subscription_exists");
  const pending = intents.filter(intent => intent.status === "pending");
  if (pending.length > 1) return blocked("billing_reconciliation_required");
  if (intents.some(intent => intent.status !== "pending" && (intent.provider_subscription_id || intent.creation_dispatched_at))) return blocked("billing_reconciliation_required");
  if (!pending.length) return { code: "ready", resumePlan: null };
  const intent = pending[0];
  if (!Object.hasOwn(intent, "creation_dispatched_at")) return blocked("billing_unavailable");
  if (intent.creation_dispatched_at && (!intent.provider_subscription_id || !(Date.parse(intent.expires_at) > now))) return blocked("billing_creation_unknown");
  return { code: "ready", resumePlan: intent.plan_id };
}

export function canManageBilling(role: string) { return role === "owner"; }

export function authorizeBillingActor(input: {
  userId?: string; clinicId?: string; membershipClinicId?: string; role?: string;
  membershipStatus?: string;
}): BillingActor {
  if (!input.userId) throw new BillingError(401, "authentication_required");
  if (!input.clinicId || input.membershipClinicId !== input.clinicId || input.membershipStatus !== "active"
    || !canManageBilling(input.role ?? "")) {
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
