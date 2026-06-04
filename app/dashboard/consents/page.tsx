import { FileSignature } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ConsentCard } from "@/components/consents/consent-card";
import { consentRecords } from "@/lib/mock-consents";

export default function ConsentsPage() {
  return (
    <>
      <PageHeader
        title="Patient consents"
        description="Create mock signing links, QR placeholders, and consent records for future secure workflows."
        action={{ label: "New consent", href: "/dashboard/consents/new", icon: <FileSignature className="h-4 w-4" /> }}
      />

      <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        This consent template must be reviewed and customized by a legal/healthcare compliance professional before real
        use. Mock signing links do not create legal signatures.
      </section>

      <section className="grid gap-4">
        {consentRecords.map((consent) => (
          <ConsentCard key={consent.id} consent={consent} />
        ))}
      </section>
    </>
  );
}
