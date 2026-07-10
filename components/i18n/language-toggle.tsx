"use client";

import { localeLabels, supportedLocales, type Locale } from "@/config/i18n";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, messages, setLocale } = useLanguage();

  return (
    <div
      className={cn("inline-flex rounded-md border border-slate-200 bg-white p-1", className)}
      role="group"
      aria-label={messages.languageToggle.label}
    >
      {supportedLocales.map((option: Locale) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          className={cn(
            "h-8 rounded px-2.5 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-teal-200",
            locale === option ? "bg-clinic text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
          )}
          aria-pressed={locale === option}
        >
          {localeLabels[option]}
        </button>
      ))}
    </div>
  );
}
