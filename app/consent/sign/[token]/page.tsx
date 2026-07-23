import type { Metadata } from "next";
import { PublicConsentSigningPage } from "@/components/consents/public-consent-signing-page";
import { getPublicConsentByToken } from "@/lib/server/public-consent-signing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Consentimiento" };
export default async function ConsentSignPage({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; const consent = await getPublicConsentByToken(token); return <PublicConsentSigningPage token={token} consent={consent} />; }
