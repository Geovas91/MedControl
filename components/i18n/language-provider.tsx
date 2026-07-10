"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultLocale, getHtmlLang, getMessages, isLocale, languageCookieName, type Locale } from "@/config/i18n";

type LanguageContextValue = {
  locale: Locale;
  messages: ReturnType<typeof getMessages>;
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  children,
  initialLocale
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? defaultLocale);

  useEffect(() => {
    document.documentElement.lang = getHtmlLang(locale);
    window.localStorage.setItem(languageCookieName, locale);
    document.cookie = `${languageCookieName}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      messages: getMessages(locale),
      setLocale: (nextLocale) => {
        if (isLocale(nextLocale)) {
          setLocaleState(nextLocale);
        }
      }
    }),
    [locale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }

  return context;
}
