import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { defaultLocale, getHtmlLang, getMessages } from "@/config/i18n";
import { seoConfig } from "@/config/seo";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const defaultMessages = getMessages(defaultLocale);

export const metadata: Metadata = {
  title: defaultMessages.metadata.title || seoConfig.title,
  description: defaultMessages.metadata.description || seoConfig.description,
  applicationName: seoConfig.siteName
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={getHtmlLang(defaultLocale)}>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
