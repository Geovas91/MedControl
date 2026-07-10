import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DirectoryPageContent } from "@/components/directory/directory-page-content";
import { defaultLocale, getMessages, isLocale, languageCookieName } from "@/config/i18n";
import { getPublishedDoctorProfiles } from "@/lib/server/directory";
import { getDoctorReviewSummaries } from "@/lib/server/reviews";

type DirectoryPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

async function getRequestMessages() {
  const cookieStore = await cookies();
  const locale = cookieStore.get(languageCookieName)?.value;

  return getMessages(isLocale(locale) ? locale : defaultLocale);
}

export async function generateMetadata(): Promise<Metadata> {
  const messages = await getRequestMessages();

  return {
    title: messages.directory.metadataTitle,
    description: messages.directory.metadataDescription
  };
}

export default async function DirectoryPage({ searchParams }: DirectoryPageProps) {
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const { data: profiles } = await getPublishedDoctorProfiles(query);
  const reviewSummaries = await getDoctorReviewSummaries(profiles.map((profile) => profile.id));

  return <DirectoryPageContent query={query} profiles={profiles} reviewSummaries={reviewSummaries} />;
}
