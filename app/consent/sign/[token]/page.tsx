import { notFound } from "next/navigation";
import { ConsentSigningPage } from "@/components/consents/consent-signing-page";
import { consentRecords, demoSigningToken } from "@/lib/mock-consents";

type ConsentSignPageProps = {
  params: Promise<{
    token: string;
  }>;
};

function isDemoConsentEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_DEMO_CONSENT === "true";
}

export function generateStaticParams() {
  if (!isDemoConsentEnabled()) {
    return [];
  }

  return consentRecords.map((consent) => ({
    token: consent.token
  }));
}

function PublicConsentUnavailable() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <section className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-clinic">CliniControl</p>
        <h1 className="mt-3 text-2xl font-bold text-ink">Este flujo de consentimiento todavía no está disponible públicamente.</h1>
        <p className="mt-4 leading-7 text-slate-600">
          CliniControl se encuentra en staging controlado. No uses este flujo con pacientes reales ni compartas enlaces de
          firma hasta completar la conexión server-side, la validación legal y las políticas de privacidad aplicables.
        </p>
      </section>
    </main>
  );
}

export default async function ConsentSignPage({ params }: ConsentSignPageProps) {
  const { token } = await params;

  if (!isDemoConsentEnabled()) {
    return <PublicConsentUnavailable />;
  }

  const exists = consentRecords.some((consent) => consent.token === token);

  if (!exists) {
    notFound();
  }

  return <ConsentSigningPage consent={{ ...demoSigningToken, token }} />;
}
