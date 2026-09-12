import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { StarRatingForm } from "@/components/reviews/star-rating-form";
import { isReviewToken } from "@/lib/reviews/token";
import { getPublicReviewInvitation } from "@/lib/server/reviews";

export const dynamic = "force-dynamic";

export default async function PublicReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = isReviewToken(token) ? await getPublicReviewInvitation(token) : { data: null, error: null };
  const data = invitation.data;
  const valid = data?.status === "valid" && data.doctorDisplayName && data.clinicName;
  return <main className="min-h-screen px-4 py-10">
    <div className="mx-auto max-w-xl">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-clinic"><Stethoscope className="h-5 w-5" />CliniControl</Link>
      {valid ? <>
        <section className="glass-card mb-5 p-5">
          <p className="text-sm font-semibold text-clinic">Reseña verificada</p>
          <h1 className="mt-2 text-2xl font-bold text-ink">Valora tu atención con {data.doctorDisplayName}</h1>
          <p className="mt-2 text-sm text-slate-600">Solicitud enviada por {data.clinicName}. No mostramos información del paciente ni detalles de la cita.</p>
        </section>
        <StarRatingForm reviewToken={token} />
      </> : <section className="glass-card-strong p-6"><h1 className="text-xl font-bold text-ink">Enlace no disponible</h1><p className="mt-3 text-sm text-slate-600">No fue posible validar este enlace. Solicita uno nuevo a la clínica si corresponde.</p></section>}
    </div>
  </main>;
}
