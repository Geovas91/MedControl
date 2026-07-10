import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  canAddDoctorToPlan,
  getDoctorLimitForPlan,
  getPlanById,
  type CommercialPlan
} from "@/config/plans";
import type { ClinicSubscription, ClinicSubscriptionInsert, ClinicSubscriptionUpdate, DoctorPlanLimit, PlanId } from "@/types/subscriptions";

export type ClinicSubscriptionResult = {
  data: ClinicSubscription | null;
  error: PostgrestError | null;
};

export type ClinicPlanContext = {
  clinicId: string;
  subscription: ClinicSubscription | null;
  plan: CommercialPlan;
  planId: PlanId;
  doctorLimit: DoctorPlanLimit;
  isUnlimitedDoctors: boolean;
  currentDoctorCount: number;
  canAddDoctor: boolean;
};

export type AddDoctorLimitValidation = {
  canAddDoctor: boolean;
  message: string | null;
  context: ClinicPlanContext;
};

export type UpsertClinicPaypalSubscriptionInput = {
  clinicId: string;
  planId: PlanId;
  status: ClinicSubscription["status"];
  providerSubscriptionId: string;
  providerPlanId: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

type DoctorCountRpcClient = {
  rpc(
    fn: "count_clinic_doctors_for_current_user",
    args: { target_clinic_id: string }
  ): Promise<{ data: number | null; error: PostgrestError | null }>;
};

type ClinicSubscriptionsAdminClient = {
  from(table: "clinic_subscriptions"): {
    upsert(
      values: ClinicSubscriptionInsert,
      options: { onConflict: "clinic_id" }
    ): {
      select(columns: "*"): {
        single(): Promise<{ data: ClinicSubscription | null; error: PostgrestError | null }>;
      };
    };
    update(values: ClinicSubscriptionUpdate): {
      eq(column: "provider_subscription_id", value: string): {
        select(columns: "*"): {
          maybeSingle(): Promise<{ data: ClinicSubscription | null; error: PostgrestError | null }>;
        };
      };
    };
  };
};

export async function getClinicSubscription(clinicId: string): Promise<ClinicSubscriptionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_subscriptions")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  return {
    data: data ?? null,
    error
  };
}

export async function getClinicPlanContext(clinicId: string): Promise<{
  data: ClinicPlanContext | null;
  error: PostgrestError | Error | null;
}> {
  const supabase = await createClient();
  const { data: subscription, error: subscriptionError } = await getClinicSubscription(clinicId);

  if (subscriptionError) {
    return { data: null, error: subscriptionError };
  }

  const planId = subscription?.plan_id ?? "basic";
  const plan = getPlanById(planId);

  if (!plan) {
    return { data: null, error: new Error(`Unknown CliniControl plan: ${planId}`) };
  }

  const doctorCountRpcClient = supabase as unknown as DoctorCountRpcClient;
  const { data: currentDoctorCount, error: doctorCountError } = await doctorCountRpcClient.rpc(
    "count_clinic_doctors_for_current_user",
    {
      target_clinic_id: clinicId
    }
  );

  if (doctorCountError) {
    return { data: null, error: doctorCountError };
  }

  const doctorLimit = getDoctorLimitForPlan(planId);

  return {
    data: {
      clinicId,
      subscription,
      plan,
      planId,
      doctorLimit,
      isUnlimitedDoctors: doctorLimit === null,
      currentDoctorCount: currentDoctorCount ?? 0,
      canAddDoctor: canAddDoctorToPlan(planId, currentDoctorCount ?? 0)
    },
    error: null
  };
}

export async function validateCanAddDoctorToClinic(clinicId: string): Promise<AddDoctorLimitValidation> {
  const { data: context, error } = await getClinicPlanContext(clinicId);

  if (error || !context) {
    throw error ?? new Error("No se pudo validar el límite de médicos del plan.");
  }

  if (context.canAddDoctor) {
    return {
      canAddDoctor: true,
      message: null,
      context
    };
  }

  const message =
    context.planId === "basic"
      ? "Tu plan CliniControl Básico permite 1 médico. Para agregar más médicos, cambia a CliniControl Plus."
      : "Tu plan CliniControl Plus permite hasta 5 médicos por clínica. Para agregar más médicos, cambia a CliniControl Pro.";

  return {
    canAddDoctor: false,
    message,
    context
  };
}

export async function assertCanAddDoctorToClinic(clinicId: string) {
  const validation = await validateCanAddDoctorToClinic(clinicId);

  if (!validation.canAddDoctor) {
    throw new Error(validation.message ?? "El plan actual no permite agregar más médicos.");
  }

  return validation.context;
}

export async function upsertClinicPaypalSubscription({
  clinicId,
  planId,
  status,
  providerSubscriptionId,
  providerPlanId,
  currentPeriodStart = null,
  currentPeriodEnd = null,
  cancelAtPeriodEnd = false
}: UpsertClinicPaypalSubscriptionInput) {
  const supabase = createAdminClient() as unknown as ClinicSubscriptionsAdminClient;

  return supabase
    .from("clinic_subscriptions")
    .upsert(
      {
        clinic_id: clinicId,
        plan_id: planId,
        status,
        billing_provider: "paypal",
        provider_subscription_id: providerSubscriptionId,
        provider_plan_id: providerPlanId,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd
      },
      { onConflict: "clinic_id" }
    )
    .select("*")
    .single();
}

export async function updatePaypalSubscriptionStatusFromProviderId({
  providerSubscriptionId,
  status,
  providerPlanId,
  currentPeriodStart,
  currentPeriodEnd,
  cancelAtPeriodEnd
}: {
  providerSubscriptionId: string;
  status: ClinicSubscription["status"];
  providerPlanId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const supabase = createAdminClient() as unknown as ClinicSubscriptionsAdminClient;

  const update: ClinicSubscriptionUpdate = {
    status
  };

  if (providerPlanId) {
    update.provider_plan_id = providerPlanId;
  }

  if (currentPeriodStart !== undefined) {
    update.current_period_start = currentPeriodStart;
  }

  if (currentPeriodEnd !== undefined) {
    update.current_period_end = currentPeriodEnd;
  }

  if (cancelAtPeriodEnd !== undefined) {
    update.cancel_at_period_end = cancelAtPeriodEnd;
  }

  return supabase
    .from("clinic_subscriptions")
    .update(update)
    .eq("provider_subscription_id", providerSubscriptionId)
    .select("*")
    .maybeSingle();
}
