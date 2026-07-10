"use client";

import { ArrowRight, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ReviewSummary } from "@/components/directory/review-summary";
import { PublicHeader } from "@/components/public/public-header";
import { useLanguage } from "@/components/i18n/language-provider";
import type { DoctorPublicProfile } from "@/types/directory";
import type { DoctorReviewSummary } from "@/types/reviews";

type DirectoryPageContentProps = {
  query: string;
  profiles: DoctorPublicProfile[];
  reviewSummaries: Record<string, DoctorReviewSummary>;
};

function joinLocation(city: string | null, state: string | null, fallback: string) {
  return [city, state].filter(Boolean).join(", ") || fallback;
}

export function DirectoryPageContent({ query, profiles, reviewSummaries }: DirectoryPageContentProps) {
  const { messages } = useLanguage();
  const copy = messages.directory;

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicHeader icon="stethoscope" />

      <section className="border-b border-slate-200 bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-clinic">{copy.eyebrow}</p>
            <h1 className="mt-3 text-4xl font-bold tracking-normal text-ink">{copy.title}</h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">{copy.description}</p>
          </div>

          <form action="/directorio" className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">{copy.searchLabel}</span>
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                name="q"
                defaultValue={query}
                placeholder={copy.searchPlaceholder}
                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-clinic focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-md bg-clinic px-4 text-sm font-semibold text-white shadow-soft transition hover:bg-teal-800"
            >
              {copy.searchButton}
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
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-bold text-ink">{profile.display_name}</h2>
                    <p className="mt-1 text-sm font-semibold text-clinic">
                      {profile.specialty ?? copy.specialtyFallback}
                    </p>
                  </div>
                  <Badge variant={profile.accepts_new_patients ? "green" : "slate"}>
                    {profile.accepts_new_patients ? copy.acceptsPatients : copy.noNewPatients}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                  {joinLocation(profile.city, profile.state, copy.locationFallback)}
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {copy.modeLabel}: {copy.consultationModes[profile.consultation_mode]}
                </p>
                <div className="mt-3">
                  <ReviewSummary summary={reviewSummaries[profile.id]} compact />
                </div>
                <ButtonLink href={`/directorio/${profile.slug}`} variant="secondary" className="mt-5 w-full">
                  {copy.viewProfile}
                  <ArrowRight className="h-4 w-4" />
                </ButtonLink>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-ink">{copy.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{copy.emptyDescription}</p>
          </div>
        )}
      </section>
    </main>
  );
}
