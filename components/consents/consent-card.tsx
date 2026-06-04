import { Copy, Eye, QrCode } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { QrCodePlaceholder } from "@/components/consents/qr-code-placeholder";
import type { ConsentRecord } from "@/types/consent";

const statusVariant = {
  Pending: "amber",
  Signed: "green",
  Expired: "slate",
  Revoked: "slate"
} as const;

export function ConsentCard({ consent }: { consent: ConsentRecord }) {
  return (
    <article className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_auto]">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-ink">{consent.patientName}</h2>
          <Badge variant={statusVariant[consent.status]}>{consent.status}</Badge>
        </div>
        <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-700">Consent type</dt>
            <dd>{consent.consentType}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">Doctor / clinic</dt>
            <dd>{consent.doctorOrClinic}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">Created</dt>
            <dd>{consent.createdDate}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">Signed</dt>
            <dd>{consent.signedDate ?? "Not signed"}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink href={consent.signingLink} variant="secondary">
            <Eye className="h-4 w-4" />
            View
          </ButtonLink>
          <ButtonLink href={consent.signingLink} variant="secondary">
            <QrCode className="h-4 w-4" />
            Generate QR
          </ButtonLink>
          <Link
            href={consent.signingLink}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-ink ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <Copy className="h-4 w-4" />
            Copy link
          </Link>
        </div>
      </div>
      <QrCodePlaceholder label={`QR for ${consent.patientName}`} />
    </article>
  );
}
