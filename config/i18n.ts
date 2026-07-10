import { brandConfig } from "@/config/brand";

export const supportedLocales = ["es", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

type Messages = {
  metadata: {
    title: string;
    description: string;
  };
  common: {
    brandName: string;
    stagingLabel: string;
  };
};

export function isLocale(value: string | undefined): value is Locale {
  return supportedLocales.includes(value as Locale);
}

const configuredLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;

export const defaultLocale: Locale = isLocale(configuredLocale) ? configuredLocale : "es";

export const messages = {
  es: {
    metadata: {
      title: `${brandConfig.appName} | Gestión para médicos y clínicas pequeñas`,
      description: brandConfig.description
    },
    common: {
      brandName: brandConfig.appName,
      stagingLabel: "Ambiente de demostración"
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
    }
  }
} satisfies Record<Locale, Messages>;

export function getMessages(locale: Locale = defaultLocale) {
  return messages[locale];
}

export function getHtmlLang(locale: Locale = defaultLocale) {
  return locale === "es" ? "es-MX" : "en";
}
