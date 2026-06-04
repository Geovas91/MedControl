import { PageHeader } from "@/components/dashboard/page-header";
import { ConsentForm } from "@/components/consents/consent-form";

export default function NewConsentPage() {
  return (
    <>
      <PageHeader
        title="Generate patient consent"
        description="Mock consent link and QR generation. Real legal validation is not implemented."
      />
      <ConsentForm />
    </>
  );
}
