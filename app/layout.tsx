import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { defaultLocale, getHtmlLang, getMessages } from "@/config/i18n";
import { brandConfig } from "@/config/brand";
import { seoConfig } from "@/config/seo";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const defaultMessages = getMessages(defaultLocale);

export const metadata: Metadata = {
  title: defaultMessages.metadata.title || seoConfig.title,
  description: defaultMessages.metadata.description || seoConfig.description,
  applicationName: seoConfig.siteName,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: brandConfig.appName,
    statusBarStyle: "default"
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F766E"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={getHtmlLang(defaultLocale)}>
      <body className={`${inter.className} antialiased`}>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
