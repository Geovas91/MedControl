import { FileSignature } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ConsentCard } from "@/components/consents/consent-card";
import { consentRecords } from "@/lib/mock-consents";

export default function ConsentsPage() {
  return (
    <>
      <PageHeader
        title="Consentimientos de pacientes"
        description="Crea enlaces demo de firma, placeholders QR y registros para futuros flujos seguros."
        action={{ label: "Nuevo consentimiento", href: "/dashboard/consents/new", icon: <FileSignature className="h-4 w-4" /> }}
      />

      <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        Esta plantilla de consentimiento debe revisarse y personalizarse por un profesional legal y de cumplimiento
        sanitario antes de uso real. Los enlaces demo no crean firmas legales.
      </section>

      <section className="grid gap-4">
        {consentRecords.map((consent) => (
          <ConsentCard key={consent.id} consent={consent} />
        ))}
      </section>
    </>
  );
}
