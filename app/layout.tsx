import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "MedControl | Gestión para médicos y clínicas pequeñas",
  description: "SaaS médico para gestionar pacientes, citas, notas, consentimientos y pagos en clínicas pequeñas."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
