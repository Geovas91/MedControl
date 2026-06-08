import type { Database } from "@/types/database";

export type PlanId = "basic" | "plus" | "pro";
export type SubscriptionStatus = "inactive" | "trialing" | "active" | "past_due" | "cancelled";
export type BillingProvider = "paypal";

export type ClinicSubscription = Database["public"]["Tables"]["clinic_subscriptions"]["Row"];
export type ClinicSubscriptionInsert = Database["public"]["Tables"]["clinic_subscriptions"]["Insert"];
export type ClinicSubscriptionUpdate = Database["public"]["Tables"]["clinic_subscriptions"]["Update"];

export type DoctorPlanLimit = number | null;
