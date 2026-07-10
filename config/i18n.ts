import { brandConfig } from "@/config/brand";

export const supportedLocales = ["es", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

export const languageCookieName = "clinicontrol-language";

export function isLocale(value: string | undefined | null): value is Locale {
  return supportedLocales.includes(value as Locale);
}

const configuredLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;

export const defaultLocale: Locale = isLocale(configuredLocale) ? configuredLocale : "es";

export const localeLabels: Record<Locale, string> = {
  es: "ES",
  en: "EN"
};

export const messages = {
  es: {
    metadata: {
      title: `${brandConfig.appName} | Gestión para médicos y clínicas pequeñas`,
      description: brandConfig.description
    },
    common: {
      brandName: brandConfig.appName,
      stagingLabel: "Ambiente de demostración"
    },
    languageToggle: {
      label: "Idioma"
    },
    nav: {
      features: "Funciones",
      pricing: "Planes",
      directory: "Directorio médico",
      contact: "Contacto",
      login: "Iniciar sesión",
      menu: "Menú"
    },
    landing: {
      hero: {
        eyebrow: "Gestión médica para clínicas en México",
        title: brandConfig.appName,
        description:
          "Un SaaS claro para médicos y clínicas pequeñas que necesitan organizar pacientes, agenda, notas médicas, consentimientos y pagos sin fricción administrativa.",
        primaryCta: "Ver dashboard",
        secondaryCta: "Ver planes"
      },
      demoCard: {
        title: "Flujo de consulta de hoy",
        date: "Lunes, 25 de mayo",
        appointmentCount: "4 citas",
        patients: ["09:00 Alicia Ramírez", "10:30 Nora Benítez", "12:00 Marco Silva"],
        appointmentStatus: "Cita confirmada",
        collected: "Cobrado",
        pending: "Pendiente"
      },
      features: {
        title: "Diseñado para el trabajo diario de consulta",
        description:
          "CliniControl empieza con lo esencial para atender pacientes, coordinar equipos y cerrar el día con claridad.",
        items: [
          {
            title: "Expedientes de pacientes",
            description:
              "Centraliza datos de contacto, estatus de atención, notas médicas y próximas citas en perfiles claros."
          },
          {
            title: "Agenda diaria",
            description: "Consulta el día por horario, médico asignado, tipo de cita y estado de confirmación."
          },
          {
            title: "Pagos y saldos",
            description:
              "Registra ingresos cobrados, pagos pendientes e historial sin convertir la app en un sistema contable pesado."
          },
          {
            title: "Base segura para clínicas",
            description:
              "Estructura preparada para cuentas autenticadas, permisos por clínica y seguridad de datos en Supabase."
          }
        ]
      },
      pricing: {
        title: "Planes para médicos y clínicas pequeñas",
        description:
          "Precios mensuales en pesos mexicanos. La suscripción mensual vía PayPal se gestiona desde el dashboard de la clínica.",
        monthlySuffix: "/ mes",
        comparisonTitle: "Comparación comercial",
        comparisonDescription:
          "Todos los planes operan con clínica personal o clínica registrada para mantener pacientes, equipos y permisos organizados por clínica.",
        featureColumn: "Función",
        included: "Incluidas",
        prepared: "Preparada",
        includedInAll: "Incluido en todos los planes",
        rows: {
          doctors: "Médicos incluidos",
          clinic: "Tipo de clínica",
          directory: "Directorio médico público",
          reviews: "Reseñas verificadas por estrellas",
          paypal: "Suscripción mensual vía PayPal"
        }
      },
      contact: {
        title: "¿Listo para organizar tu consulta?",
        description: "Escríbenos por WhatsApp para revisar qué plan encaja mejor con tu operación médica.",
        cta: "Contactar a ventas",
        pending: "WhatsApp de ventas por configurar"
      },
      footer: {
        text: "CliniControl para médicos y clínicas pequeñas.",
        demo: "Staging controlado. No uses datos reales de pacientes."
      }
    },
    auth: {
      login: {
        title: "Bienvenido de nuevo",
        description:
          "Inicia sesión con Supabase Auth cuando las variables de entorno del proyecto estén configuradas.",
        emailLabel: "Email",
        emailPlaceholder: "doctor@clinic.com",
        passwordLabel: "Contraseña",
        passwordPlaceholder: "Contraseña",
        submit: "Iniciar sesión",
        pending: "Iniciando sesión...",
        note: "El dashboard se valida con sesión, onboarding y membresía de clínica.",
        alternatePrefix: "¿Nuevo en CliniControl?",
        alternateCta: "Crear cuenta"
      },
      signup: {
        title: "Crea tu espacio clínico",
        description: "Crea un usuario con Supabase Auth. La clínica y membresía se completan en el flujo de onboarding.",
        clinicLabel: "Nombre de la clínica",
        clinicPlaceholder: "Clínica Familiar Norte",
        nameLabel: "Tu nombre",
        namePlaceholder: "Dr. Alex Morgan",
        emailLabel: "Email de trabajo",
        emailPlaceholder: "doctor@clinic.com",
        passwordLabel: "Contraseña",
        passwordPlaceholder: "Mínimo 6 caracteres",
        submit: "Crear cuenta",
        pending: "Creando cuenta...",
        note:
          "Esta fase crea el usuario de autenticación y guarda metadata de registro. La clínica y membresía se completan en onboarding.",
        alternatePrefix: "¿Ya tienes cuenta?",
        alternateCta: "Iniciar sesión"
      },
      messages: {
        signedOut: "Has cerrado sesión.",
        missingCredentials: "Ingresa tu email y contraseña.",
        completeRequiredFields: "Completa todos los campos requeridos.",
        accountCreated: "Cuenta creada. Puedes continuar al dashboard.",
        checkEmail: "Revisa tu email para confirmar tu cuenta."
      }
    },
    directory: {
      metadataTitle: `Directorio médico | ${brandConfig.appName}`,
      metadataDescription: `Directorio público de médicos registrados en ${brandConfig.appName}.`,
      eyebrow: "Directorio médico público",
      title: `Médicos registrados en ${brandConfig.appName}`,
      description:
        "Encuentra perfiles públicos configurados por médicos y clínicas que usan CliniControl. Este directorio no sustituye una valoración médica ni promete resultados clínicos.",
      searchLabel: "Buscar médicos",
      searchPlaceholder: "Buscar por nombre, especialidad o ciudad",
      searchButton: "Buscar",
      locationFallback: "Ubicación no publicada",
      specialtyFallback: "Especialidad no publicada",
      acceptsPatients: "Acepta pacientes",
      noNewPatients: "Sin nuevos pacientes",
      reviewsEmpty: "Sin reseñas todavía",
      ratingOutOf: "de 5",
      verifiedReviewSingular: "reseña verificada",
      verifiedReviewPlural: "reseñas verificadas",
      modeLabel: "Modalidad",
      consultationModes: {
        presencial: "Presencial",
        online: "Online",
        hibrida: "Híbrida"
      },
      viewProfile: "Ver perfil",
      emptyTitle: "Aún no hay perfiles publicados",
      emptyDescription:
        "Cuando médicos o clínicas publiquen su perfil público, aparecerán aquí sin mostrar datos privados ni información clínica de pacientes."
    }
  },
  en: {
    metadata: {
      title: `${brandConfig.appName} | Practice management for doctors and small clinics`,
      description: "Medical SaaS for managing patients, appointments, notes, consents, and payments in small clinics."
    },
    common: {
      brandName: brandConfig.appName,
      stagingLabel: "Demo environment"
    },
    languageToggle: {
      label: "Language"
    },
    nav: {
      features: "Features",
      pricing: "Pricing",
      directory: "Doctor directory",
      contact: "Contact",
      login: "Sign in",
      menu: "Menu"
    },
    landing: {
      hero: {
        eyebrow: "Medical operations for clinics in Mexico",
        title: brandConfig.appName,
        description:
          "A clear SaaS for doctors and small clinics that need to organize patients, schedules, medical notes, consents, and payments without administrative friction.",
        primaryCta: "View dashboard",
        secondaryCta: "View plans"
      },
      demoCard: {
        title: "Today's consultation flow",
        date: "Monday, May 25",
        appointmentCount: "4 visits",
        patients: ["09:00 Alicia Ramírez", "10:30 Nora Benítez", "12:00 Marco Silva"],
        appointmentStatus: "Confirmed appointment",
        collected: "Collected",
        pending: "Pending"
      },
      features: {
        title: "Designed for daily clinical work",
        description:
          "CliniControl starts with the essentials to care for patients, coordinate teams, and close the day with clarity.",
        items: [
          {
            title: "Patient records",
            description: "Centralize contact details, care status, medical notes, and upcoming visits in clear profiles."
          },
          {
            title: "Daily schedule",
            description: "Review the day by time, assigned doctor, appointment type, and confirmation status."
          },
          {
            title: "Payments and balances",
            description:
              "Track collected income, pending payments, and history without turning the app into a heavy accounting system."
          },
          {
            title: "Secure base for clinics",
            description:
              "Prepared for authenticated accounts, clinic-level permissions, and secure data handling in Supabase."
          }
        ]
      },
      pricing: {
        title: "Plans for doctors and small clinics",
        description:
          "Fixed monthly commercial prices in USD. PayPal sandbox subscription handling remains in the clinic dashboard.",
        monthlySuffix: "/ month",
        comparisonTitle: "Commercial comparison",
        comparisonDescription:
          "Every plan works with a personal or registered clinic to keep patients, teams, and permissions organized by clinic.",
        featureColumn: "Feature",
        included: "Included",
        prepared: "Prepared",
        includedInAll: "Included in every plan",
        rows: {
          doctors: "Included doctors",
          clinic: "Clinic type",
          directory: "Public doctor directory",
          reviews: "Verified star reviews",
          paypal: "Monthly PayPal subscription"
        }
      },
      contact: {
        title: "Ready to organize your practice?",
        description: "Message us on WhatsApp to review which plan best fits your medical operation.",
        cta: "Contact sales",
        pending: "Sales WhatsApp pending configuration"
      },
      footer: {
        text: "CliniControl for doctors and small clinics.",
        demo: "Controlled staging. Do not use real patient data."
      }
    },
    auth: {
      login: {
        title: "Welcome back",
        description: "Sign in with Supabase Auth once the project environment variables are configured.",
        emailLabel: "Email",
        emailPlaceholder: "doctor@clinic.com",
        passwordLabel: "Password",
        passwordPlaceholder: "Password",
        submit: "Sign in",
        pending: "Signing in...",
        note: "The dashboard is validated with a session, onboarding, and clinic membership.",
        alternatePrefix: "New to CliniControl?",
        alternateCta: "Create account"
      },
      signup: {
        title: "Create your clinical workspace",
        description: "Create a user with Supabase Auth. Clinic and membership setup are completed during onboarding.",
        clinicLabel: "Clinic name",
        clinicPlaceholder: "North Family Clinic",
        nameLabel: "Your name",
        namePlaceholder: "Dr. Alex Morgan",
        emailLabel: "Work email",
        emailPlaceholder: "doctor@clinic.com",
        passwordLabel: "Password",
        passwordPlaceholder: "At least 6 characters",
        submit: "Create account",
        pending: "Creating account...",
        note:
          "This phase creates the authentication user and stores registration metadata. Clinic and membership setup are completed during onboarding.",
        alternatePrefix: "Already have an account?",
        alternateCta: "Sign in"
      },
      messages: {
        signedOut: "You have been signed out.",
        missingCredentials: "Enter your email and password.",
        completeRequiredFields: "Complete all required fields.",
        accountCreated: "Account created. You can continue to the dashboard.",
        checkEmail: "Check your email to confirm your account."
      }
    },
    directory: {
      metadataTitle: `Doctor directory | ${brandConfig.appName}`,
      metadataDescription: `Public directory of doctors registered in ${brandConfig.appName}.`,
      eyebrow: "Public doctor directory",
      title: `Doctors registered in ${brandConfig.appName}`,
      description:
        "Find public profiles configured by doctors and clinics using CliniControl. This directory does not replace a medical evaluation or promise clinical results.",
      searchLabel: "Search doctors",
      searchPlaceholder: "Search by name, specialty, or city",
      searchButton: "Search",
      locationFallback: "Location not published",
      specialtyFallback: "Specialty not published",
      acceptsPatients: "Accepting patients",
      noNewPatients: "Not accepting new patients",
      reviewsEmpty: "No reviews yet",
      ratingOutOf: "out of 5",
      verifiedReviewSingular: "verified review",
      verifiedReviewPlural: "verified reviews",
      modeLabel: "Mode",
      consultationModes: {
        presencial: "In person",
        online: "Online",
        hibrida: "Hybrid"
      },
      viewProfile: "View profile",
      emptyTitle: "No published profiles yet",
      emptyDescription:
        "When doctors or clinics publish their public profile, they will appear here without exposing private data or clinical patient information."
    }
  }
} as const;

export type Messages = (typeof messages)[Locale];

export function getMessages(locale: Locale = defaultLocale) {
  return messages[locale];
}

export function getHtmlLang(locale: Locale = defaultLocale) {
  return locale === "es" ? "es-MX" : "en";
}
