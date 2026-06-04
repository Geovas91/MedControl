import { notFound } from "next/navigation";
import { ConsentSigningPage } from "@/components/consents/consent-signing-page";
import { consentRecords, demoSigningToken } from "@/lib/mock-consents";

type ConsentSignPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export function generateStaticParams() {
  return consentRecords.map((consent) => ({
    token: consent.token
  }));
}

export default async function ConsentSignPage({ params }: ConsentSignPageProps) {
  const { token } = await params;
  const exists = consentRecords.some((consent) => consent.token === token);

  if (!exists) {
    notFound();
  }

  return <ConsentSigningPage consent={{ ...demoSigningToken, token }} />;
}
