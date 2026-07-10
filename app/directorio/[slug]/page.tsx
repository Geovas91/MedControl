import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, MessageCircle, Phone, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ReviewSummary } from "@/components/directory/review-summary";
import { getPublishedDoctorProfileBySlug } from "@/lib/server/directory";
import { getDoctorReviewSummary } from "@/lib/server/reviews";

const consultationModeLabels = {
  presencial: "Presencial",
  online: "Online",
  hibrida: "Híbrida"
} as const;

type DirectoryProfilePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function locationLabel(addressLine: string | null, city: string | null, state: string | null, country: string) {
  return [addressLine, city, state, country].filter(Boolean).join(", ");
}

function whatsappUrl(value: string | null) {
  const digits = value?.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export async function generateMetadata({ params }: DirectoryProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const { data: profile } = await getPublishedDoctorProfileBySlug(slug);

  if (!profile) {
    return {
      title: "Perfil médico | CliniControl"
    };
  }

  return {
    title: `${profile.display_name}${profile.specialty ? ` | ${profile.specialty}` : ""} | CliniControl`,
    description: `Perfil público de ${profile.display_name} en el directorio médico de CliniControl.`
  };
}

export default async function DirectoryProfilePage({ params }: DirectoryProfilePageProps) {
  const { slug } = await params;
  const { data: profile } = await getPublishedDoctorProfileBySlug(slug);

  if (!profile) {
    notFound();
  }

  const { data: reviewSummary } = await getDoctorReviewSummary(profile.id);
  const contactWhatsAppUrl = whatsappUrl(profile.whatsapp);
  const contactHref = contactWhatsAppUrl ?? (profile.phone ? `tel:${profile.phone}` : null);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-clinic text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-ink">CliniControl</span>
          </Link>
          <Link href="/directorio" className="inline-flex items-center gap-2 text-sm font-semibold text-clinic">
            <ArrowLeft className="h-4 w-4" />
            Directorio
          </Link>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge variant={profile.accepts_new_patients ? "green" : "slate"}>
                {profile.accepts_new_patients ? "Acepta nuevos pacientes" : "No acepta nuevos pacientes"}
              </Badge>
              <h1 className="mt-4 text-4xl font-bold tracking-normal text-ink">{profile.display_name}</h1>
              {profile.professional_title ? (
                <p className="mt-2 text-lg font-semibold text-slate-700">{profile.professional_title}</p>
              ) : null}
              <p className="mt-2 text-lg text-clinic">
                {[profile.specialty, profile.subspecialty].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-4">
                <ReviewSummary summary={reviewSummary} />
              </div>
            </div>
            {contactHref ? (
              <a
                href={contactHref}
                target={contactWhatsAppUrl ? "_blank" : undefined}
                rel={contactWhatsAppUrl ? "noopener noreferrer" : undefined}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-clinic px-4 text-sm font-semibold text-white shadow-soft transition hover:bg-teal-800"
              >
                <MessageCircle className="h-4 w-4" />
                Contactar
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_20rem] lg:px-8">
        <div className="grid gap-6">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-ink">Reseñas verificadas</h2>
            <div className="mt-3">
              <ReviewSummary summary={reviewSummary} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Las reseñas son calificaciones por estrellas de pacientes atendidos. No se muestran comentarios, nombres
              de pacientes ni detalles de citas.
            </p>
          </article>

          {profile.bio ? (
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-ink">Biografía</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{profile.bio}</p>
            </article>
          ) : null}

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-ink">Información profesional</h2>
            <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
              {profile.years_experience !== null ? (
                <div>
                  <dt className="font-semibold text-slate-500">Experiencia</dt>
                  <dd className="mt-1 text-ink">{profile.years_experience} años</dd>
                </div>
              ) : null}
              <div>
                <dt className="font-semibold text-slate-500">Modalidad</dt>
                <dd className="mt-1 text-ink">{consultationModeLabels[profile.consultation_mode]}</dd>
              </div>
              {profile.professional_license ? (
                <div>
                  <dt className="font-semibold text-slate-500">Cédula profesional</dt>
                  <dd className="mt-1 text-ink">{profile.professional_license}</dd>
                </div>
              ) : null}
              {profile.specialty_license ? (
                <div>
                  <dt className="font-semibold text-slate-500">Cédula de especialidad</dt>
                  <dd className="mt-1 text-ink">{profile.specialty_license}</dd>
                </div>
              ) : null}
            </dl>
          </article>

          {profile.languages.length > 0 || profile.services.length > 0 ? (
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-ink">Servicios e idiomas</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                {profile.languages.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500">Idiomas</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.languages.map((language) => (
                        <Badge key={language} variant="teal">
                          {language}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {profile.services.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500">Servicios</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.services.map((service) => (
                        <Badge key={service}>{service}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          ) : null}
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:h-fit">
          <h2 className="text-lg font-bold text-ink">Contacto público</h2>
          <div className="mt-4 grid gap-3 text-sm text-slate-600">
            <div className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>{locationLabel(profile.address_line, profile.city, profile.state, profile.country)}</span>
            </div>
            {profile.whatsapp ? (
              <div className="flex gap-2">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{profile.whatsapp}</span>
              </div>
            ) : null}
            {profile.phone ? (
              <div className="flex gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{profile.phone}</span>
              </div>
            ) : null}
            {profile.public_email ? (
              <div className="flex gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{profile.public_email}</span>
              </div>
            ) : null}
          </div>
          {profile.website_url ? (
            <ButtonLink href={profile.website_url} variant="secondary" className="mt-5 w-full">
              Sitio web
            </ButtonLink>
          ) : null}
          <p className="mt-5 text-xs leading-5 text-slate-500">
            Este perfil es informativo y no sustituye una valoración médica profesional.
          </p>
        </aside>
      </section>
    </main>
  );
}
