"use client";

import { Menu, Sparkles, Stethoscope, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { ButtonLink } from "@/components/ui/button";
import { brandConfig } from "@/config/brand";
import { useLanguage } from "@/components/i18n/language-provider";

type PublicHeaderProps = {
  showSectionLinks?: boolean;
  icon?: "sparkles" | "stethoscope";
};

export function PublicHeader({ showSectionLinks = false, icon = "stethoscope" }: PublicHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { messages } = useLanguage();
  const Icon = icon === "sparkles" ? Sparkles : Stethoscope;
  const navItems = [
    { href: "#features", label: messages.nav.features },
    { href: "#pricing", label: messages.nav.pricing },
    { href: "/directorio", label: messages.nav.directory },
    { href: "#contact", label: messages.nav.contact }
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto grid min-h-16 max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:flex-wrap sm:justify-between sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-clinic text-white">
            <Icon className="h-5 w-5" />
          </div>
          <span className="truncate text-lg font-bold text-ink">{brandConfig.appName}</span>
        </Link>

        {showSectionLinks ? (
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
            {navItems.map((item) =>
              item.href.startsWith("/") ? (
                <Link key={item.href} href={item.href} className="hover:text-clinic">
                  {item.label}
                </Link>
              ) : (
                <a key={item.href} href={item.href} className="hover:text-clinic">
                  {item.label}
                </a>
              )
            )}
          </nav>
        ) : null}

        <div className="col-span-2 flex w-full items-center gap-2 sm:col-span-1 sm:ml-auto sm:w-auto">
          <LanguageToggle />
          <ButtonLink href="/login" variant="secondary" className="hidden h-10 px-3 sm:inline-flex sm:px-4">
            {messages.nav.login}
          </ButtonLink>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-ink sm:hidden"
          aria-label={messages.nav.menu}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {isOpen ? (
        <div className="border-t border-slate-200 bg-white px-4 py-4 sm:hidden">
          {showSectionLinks ? (
            <nav className="grid gap-2 text-sm font-medium text-slate-700">
              {navItems.map((item) =>
                item.href.startsWith("/") ? (
                  <Link key={item.href} href={item.href} className="rounded-md px-2 py-2 hover:bg-slate-50">
                    {item.label}
                  </Link>
                ) : (
                  <a key={item.href} href={item.href} className="rounded-md px-2 py-2 hover:bg-slate-50">
                    {item.label}
                  </a>
                )
              )}
            </nav>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <LanguageToggle />
            <ButtonLink href="/login" variant="secondary" className="h-10">
              {messages.nav.login}
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </header>
  );
}
