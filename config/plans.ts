import type { BillingProvider, DoctorPlanLimit, PlanId } from "@/types/subscriptions";

export type BillingType = "subscription";
export type BillingPeriod = "month";
export type PlanCurrency = "MXN";
export type PaypalPlanEnvKey = "PAYPAL_BASIC_PLAN_ID" | "PAYPAL_PLUS_PLAN_ID" | "PAYPAL_PRO_PLAN_ID";

export type CommercialPlan = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPriceMxn: number;
  currency: PlanCurrency;
  billingPeriod: BillingPeriod;
  taxLabel: "+ IVA";
  highlighted: boolean;
  ctaLabel: string;
  ctaHref: string;
  badgeLabel?: string;
  audience: string;
  features: string[];
  limits: {
    doctors: string;
    users: string;
    clinic: string;
    directoryProfiles: string;
    fairUse?: string;
  };
  billing: {
    provider: BillingProvider;
    type: BillingType;
    paypalPlanId: string | null;
    paypalPlanEnvKey: PaypalPlanEnvKey;
  };
};

const sharedFeatures = [
  "Clínica personal o clínica registrada",
  "Gestión de pacientes",
  "Agenda de citas",
  "Notas médicas",
  "Plantillas basadas en especialidad",
  "Registro y consulta de pagos",
  "Consentimientos básicos",
  "Acceso al directorio médico público",
  "Perfil público para médicos",
  "Reseñas verificadas por estrellas",
  "Sin comentarios escritos en reseñas",
  "Suscripción mensual vía PayPal",
  "Soporte base"
] as const;

function paypalSubscriptionBilling(paypalPlanEnvKey: PaypalPlanEnvKey) {
  return {
    provider: "paypal",
    type: "subscription",
    paypalPlanId: null,
    paypalPlanEnvKey
  } as const;
}

const basicPaypalBilling = paypalSubscriptionBilling("PAYPAL_BASIC_PLAN_ID");
const plusPaypalBilling = paypalSubscriptionBilling("PAYPAL_PLUS_PLAN_ID");
const proPaypalBilling = paypalSubscriptionBilling("PAYPAL_PRO_PLAN_ID");

export const paypalPlanEnvKeysByPlan = {
  basic: "PAYPAL_BASIC_PLAN_ID",
  plus: "PAYPAL_PLUS_PLAN_ID",
  pro: "PAYPAL_PRO_PLAN_ID"
} satisfies Record<PlanId, PaypalPlanEnvKey>;

export const commercialPlans = [
  {
    id: "basic",
    name: "MedControl Básico",
    description: "Para médicos independientes que quieren ordenar pacientes, agenda, notas y pagos desde el primer día.",
    monthlyPriceMxn: 349,
    currency: "MXN",
    billingPeriod: "month",
    taxLabel: "+ IVA",
    highlighted: false,
    ctaLabel: "Comenzar con Básico",
    ctaHref: "/signup",
    audience: "Médico independiente",
    features: [
      "1 médico",
      "Clínica personal incluida",
      "1 perfil público en el directorio médico",
      "Agenda de citas",
      "Gestión de pacientes",
      "Notas médicas",
      "Plantillas basadas en especialidad",
      "Consentimientos básicos",
      "Registro y consulta de pagos",
      "Reseñas verificadas por estrellas",
      "Suscripción mensual vía PayPal",
      "Soporte por correo"
    ],
    limits: {
      doctors: "1 médico",
      users: "Sin usuarios administrativos adicionales",
      clinic: "Clínica personal incluida",
      directoryProfiles: "1 perfil público"
    },
    billing: basicPaypalBilling
  },
  {
    id: "plus",
    name: "MedControl Plus",
    description: "Para clínicas pequeñas que necesitan coordinar médicos, asistentes, pacientes y pagos en un solo lugar.",
    monthlyPriceMxn: 799,
    currency: "MXN",
    billingPeriod: "month",
    taxLabel: "+ IVA",
    highlighted: true,
    ctaLabel: "Elegir Plus",
    ctaHref: "/signup",
    badgeLabel: "Más recomendado",
    audience: "Clínicas pequeñas",
    features: [
      "Todo lo del Plan Básico",
      "Hasta 5 médicos por clínica",
      "Usuarios administrativos/asistentes",
      "Gestión centralizada de pacientes por clínica",
      "Agenda por médico",
      "Roles por clínica",
      "Notas médicas por médico",
      "Plantillas basadas en especialidad",
      "Consentimientos por paciente",
      "Registro y consulta de pagos",
      "Reportes básicos de citas y pagos",
      "Invitaciones de calendario",
      "Perfil público para cada médico",
      "Reseñas verificadas por médico",
      "Suscripción mensual vía PayPal",
      "Soporte prioritario"
    ],
    limits: {
      doctors: "Hasta 5 médicos por clínica",
      users: "Administrativos/asistentes incluidos",
      clinic: "Clínica registrada",
      directoryProfiles: "Perfil público para cada médico"
    },
    billing: plusPaypalBilling
  },
  {
    id: "pro",
    name: "MedControl Pro",
    description: "Para clínicas en crecimiento que requieren roles avanzados, reportes ampliados y automatización operativa.",
    monthlyPriceMxn: 1299,
    currency: "MXN",
    billingPeriod: "month",
    taxLabel: "+ IVA",
    highlighted: false,
    ctaLabel: "Elegir Pro",
    ctaHref: "/signup",
    audience: "Clínicas en crecimiento",
    features: [
      "Todo lo del Plan Plus",
      "Médicos ilimitados por clínica",
      "Usuarios administrativos/asistentes sin límite definido",
      "Gestión avanzada de roles por clínica",
      "Agenda centralizada por médico",
      "Gestión centralizada de pacientes",
      "Notas médicas por especialidad",
      "Plantillas basadas en especialidad",
      "Consentimientos personalizados",
      "Registro y consulta de pagos",
      "Reportes ampliados de citas y pagos",
      "Bot premium de confirmación de citas",
      "Recordatorios avanzados",
      "Configuración avanzada de horarios",
      "Perfil público para cada médico",
      "Reseñas verificadas por médico",
      "Suscripción mensual vía PayPal",
      "Soporte preferente",
      "Sujeto a uso razonable"
    ],
    limits: {
      doctors: "Médicos ilimitados por clínica",
      users: "Administrativos/asistentes sin límite definido",
      clinic: "Clínica registrada",
      directoryProfiles: "Perfil público para cada médico",
      fairUse: "Sujeto a uso razonable"
    },
    billing: proPaypalBilling
  }
] satisfies CommercialPlan[];

export const commonCommercialFeatures = [...sharedFeatures];

const doctorLimitsByPlan = {
  basic: 1,
  plus: 5,
  pro: null
} satisfies Record<PlanId, DoctorPlanLimit>;

export function getPlanById(planId: PlanId) {
  return commercialPlans.find((plan) => plan.id === planId) ?? null;
}

export function isPlanId(value: string): value is PlanId {
  return value === "basic" || value === "plus" || value === "pro";
}

export function getDoctorLimitForPlan(planId: PlanId): DoctorPlanLimit {
  return doctorLimitsByPlan[planId];
}

export function canAddDoctorToPlan(planId: PlanId, currentDoctorCount: number) {
  const doctorLimit = getDoctorLimitForPlan(planId);

  if (doctorLimit === null) {
    return true;
  }

  return currentDoctorCount < doctorLimit;
}
