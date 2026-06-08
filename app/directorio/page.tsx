import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin, Search, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ReviewSummary } from "@/components/directory/review-summary";
import { getPublishedDoctorProfiles } from "@/lib/server/directory";
import { getDoctorReviewSummaries } from "@/lib/server/reviews";

export const metadata: Metadata = {
  title: "Directorio médico | MedControl",
  description: "Directorio público de médicos registrados en MedControl."
};

const consultationModeLabels = {
  presencial: "Presencial",
  online: "Online",
  hibrida: "Híbrida"
} as const;

type DirectoryPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

function locationLabel(city: string | null, state: string | null) {
  return [city, state].filter(Boolean).join(", ") || "Ubicación no publicada";
}

export default async function DirectoryPage({ searchParams }: DirectoryPageProps) {
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const { data: profiles } = await getPublishedDoctorProfiles(query);
  const reviewSummaries = await getDoctorReviewSummaries(profiles.map((profile) => profile.id));

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-clinic text-white">
              <Stethoscope className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-ink">MedControl</span>
          </Link>
          <ButtonLink href="/login" variant="secondary" className="h-10">
            Iniciar sesión
          </ButtonLink>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-clinic">Directorio médico público</p>
            <h1 className="mt-3 text-4xl font-bold tracking-normal text-ink">Médicos registrados en MedControl</h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Encuentra perfiles públicos configurados por médicos y clínicas que usan MedControl. Este directorio no
              sustituye una valoración médica ni promete resultados clínicos.
            </p>
          </div>

          <form action="/directorio" className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Buscar médicos</span>
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                name="q"
                defaultValue={query}
                placeholder="Buscar por nombre, especialidad o ciudad"
                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-clinic focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-md bg-clinic px-4 text-sm font-semibold text-white shadow-soft transition hover:bg-teal-800"
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {profiles.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <article key={profile.id} className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-ink">{profile.display_name}</h2>
                    <p className="mt-1 text-sm font-semibold text-clinic">{profile.specialty ?? "Especialidad no publicada"}</p>
                  </div>
                  <Badge variant={profile.accepts_new_patients ? "green" : "slate"}>
                    {profile.accepts_new_patients ? "Acepta pacientes" : "Sin nuevos pacientes"}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {locationLabel(profile.city, profile.state)}
                </div>
                <p className="mt-3 text-sm text-slate-600">Modalidad: {consultationModeLabels[profile.consultation_mode]}</p>
                <div className="mt-3">
                  <ReviewSummary summary={reviewSummaries[profile.id]} compact />
                </div>
                <ButtonLink href={`/directorio/${profile.slug}`} variant="secondary" className="mt-5 w-full">
                  Ver perfil
                  <ArrowRight className="h-4 w-4" />
                </ButtonLink>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-ink">Aún no hay perfiles publicados</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Cuando médicos o clínicas publiquen su perfil público, aparecerán aquí sin mostrar datos privados ni
              información clínica de pacientes.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
