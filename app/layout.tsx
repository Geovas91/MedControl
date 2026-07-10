import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { defaultLocale, getHtmlLang, getMessages, isLocale, languageCookieName } from "@/config/i18n";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

async function getRequestLocale() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(languageCookieName)?.value;

  return isLocale(cookieLocale) ? cookieLocale : defaultLocale;
}

export async function generateMetadata(): Promise<Metadata> {
  const messages = getMessages(await getRequestLocale());

  return {
    title: messages.metadata.title,
    description: messages.metadata.description
  };
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();

  return (
    <html lang={getHtmlLang(locale)}>
      <body className={`${inter.className} antialiased`}>
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
