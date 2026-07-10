import type { BillingProvider, DoctorPlanLimit, PlanId } from "@/types/subscriptions";
import type { Locale } from "@/config/i18n";

export type BillingType = "subscription";
export type BillingPeriod = "month";
export type PlanCurrency = "MXN" | "USD";
export type PaypalPlanEnvKey = "PAYPAL_BASIC_PLAN_ID" | "PAYPAL_PLUS_PLAN_ID" | "PAYPAL_PRO_PLAN_ID";

export type PlanLimits = {
  doctors: string;
  users: string;
  clinic: string;
  directoryProfiles: string;
  fairUse?: string;
};

export type CommercialPlan = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPriceMxn: number;
  monthlyPriceUsd: number;
  currency: "MXN";
  billingPeriod: BillingPeriod;
  taxLabel: "+ IVA";
  translations: {
    en: {
      name: string;
      description: string;
      taxLabel: "+ applicable taxes";
      ctaLabel: string;
      badgeLabel?: string;
      audience: string;
      features: string[];
      limits: PlanLimits;
    };
  };
  highlighted: boolean;
  ctaLabel: string;
  ctaHref: string;
  badgeLabel?: string;
  audience: string;
  features: string[];
  limits: PlanLimits;
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

const sharedFeaturesEn = [
  "Personal clinic or registered clinic",
  "Patient management",
  "Appointment scheduling",
  "Medical notes",
  "Specialty-based templates",
  "Payment tracking and lookup",
  "Basic consents",
  "Access to the public doctor directory",
  "Public profiles for doctors",
  "Verified star reviews",
  "No written review comments",
  "Monthly subscription via PayPal",
  "Base support"
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
    name: "CliniControl Básico",
    description: "Para médicos independientes que quieren ordenar pacientes, agenda, notas y pagos desde el primer día.",
    monthlyPriceMxn: 349,
    monthlyPriceUsd: 19,
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
    translations: {
      en: {
        name: "CliniControl Basic",
        description: "For independent doctors who want to organize patients, schedules, notes, and payments from day one.",
        taxLabel: "+ applicable taxes",
        ctaLabel: "Start with Basic",
        audience: "Independent doctor",
        features: [
          "1 doctor",
          "Personal clinic included",
          "1 public profile in the doctor directory",
          "Appointment scheduling",
          "Patient management",
          "Medical notes",
          "Specialty-based templates",
          "Basic consents",
          "Payment tracking and lookup",
          "Verified star reviews",
          "Monthly subscription via PayPal",
          "Email support"
        ],
        limits: {
          doctors: "1 doctor",
          users: "No additional administrative users",
          clinic: "Personal clinic included",
          directoryProfiles: "1 public profile"
        }
      }
    },
    billing: basicPaypalBilling
  },
  {
    id: "plus",
    name: "CliniControl Plus",
    description: "Para clínicas pequeñas que necesitan coordinar médicos, asistentes, pacientes y pagos en un solo lugar.",
    monthlyPriceMxn: 799,
    monthlyPriceUsd: 45,
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
    translations: {
      en: {
        name: "CliniControl Plus",
        description: "For small clinics that need to coordinate doctors, assistants, patients, and payments in one place.",
        taxLabel: "+ applicable taxes",
        ctaLabel: "Choose Plus",
        badgeLabel: "Most recommended",
        audience: "Small clinics",
        features: [
          "Everything in Basic",
          "Up to 5 doctors per clinic",
          "Administrative users/assistants",
          "Centralized patient management by clinic",
          "Schedule by doctor",
          "Clinic roles",
          "Medical notes by doctor",
          "Specialty-based templates",
          "Consents by patient",
          "Payment tracking and lookup",
          "Basic appointment and payment reports",
          "Calendar invitations",
          "Public profile for each doctor",
          "Verified reviews by doctor",
          "Monthly subscription via PayPal",
          "Priority support"
        ],
        limits: {
          doctors: "Up to 5 doctors per clinic",
          users: "Administrative users/assistants included",
          clinic: "Registered clinic",
          directoryProfiles: "Public profile for each doctor"
        }
      }
    },
    billing: plusPaypalBilling
  },
  {
    id: "pro",
    name: "CliniControl Pro",
    description: "Para clínicas en crecimiento que requieren roles avanzados, reportes ampliados y automatización operativa.",
    monthlyPriceMxn: 1299,
    monthlyPriceUsd: 75,
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
    translations: {
      en: {
        name: "CliniControl Pro",
        description: "For growing clinics that need advanced roles, expanded reports, and operational automation.",
        taxLabel: "+ applicable taxes",
        ctaLabel: "Choose Pro",
        audience: "Growing clinics",
        features: [
          "Everything in Plus",
          "Unlimited doctors per clinic",
          "Administrative users/assistants with no defined limit",
          "Advanced clinic role management",
          "Centralized schedule by doctor",
          "Centralized patient management",
          "Medical notes by specialty",
          "Specialty-based templates",
          "Custom consents",
          "Payment tracking and lookup",
          "Expanded appointment and payment reports",
          "Premium appointment confirmation bot",
          "Advanced reminders",
          "Advanced schedule configuration",
          "Public profile for each doctor",
          "Verified reviews by doctor",
          "Monthly subscription via PayPal",
          "Preferred support",
          "Subject to fair use"
        ],
        limits: {
          doctors: "Unlimited doctors per clinic",
          users: "Administrative users/assistants with no defined limit",
          clinic: "Registered clinic",
          directoryProfiles: "Public profile for each doctor",
          fairUse: "Subject to fair use"
        }
      }
    },
    billing: proPaypalBilling
  }
] satisfies CommercialPlan[];

export const commonCommercialFeatures = [...sharedFeatures];
export const commonCommercialFeaturesEn = [...sharedFeaturesEn];

export type LocalizedCommercialPlan = CommercialPlan & {
  displayName: string;
  displayDescription: string;
  displayMonthlyPrice: number;
  displayCurrency: PlanCurrency;
  displayTaxLabel: "+ IVA" | "+ applicable taxes";
  displayCtaLabel: string;
  displayBadgeLabel?: string;
  displayAudience: string;
  displayFeatures: string[];
  displayLimits: PlanLimits;
};

export function getLocalizedCommercialPlans(locale: Locale): LocalizedCommercialPlan[] {
  return commercialPlans.map((plan) => {
    if (locale === "en") {
      const translation = plan.translations.en;

      return {
        ...plan,
        displayName: translation.name,
        displayDescription: translation.description,
        displayMonthlyPrice: plan.monthlyPriceUsd,
        displayCurrency: "USD",
        displayTaxLabel: translation.taxLabel,
        displayCtaLabel: translation.ctaLabel,
        displayBadgeLabel: translation.badgeLabel,
        displayAudience: translation.audience,
        displayFeatures: translation.features,
        displayLimits: translation.limits
      };
    }

    return {
      ...plan,
      displayName: plan.name,
      displayDescription: plan.description,
      displayMonthlyPrice: plan.monthlyPriceMxn,
      displayCurrency: "MXN",
      displayTaxLabel: plan.taxLabel,
      displayCtaLabel: plan.ctaLabel,
      displayBadgeLabel: plan.badgeLabel,
      displayAudience: plan.audience,
      displayFeatures: plan.features,
      displayLimits: plan.limits
    };
  });
}

export function getLocalizedCommonCommercialFeatures(locale: Locale) {
  return locale === "en" ? [...commonCommercialFeaturesEn] : [...commonCommercialFeatures];
}

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
