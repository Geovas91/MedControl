import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { SafeSupportMarkdown } from "@/components/support/safe-markdown";
import { getVisibleSupportArticle } from "@/lib/server/support/articles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SupportArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getVisibleSupportArticle(slug);
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state !== "ready") notFound();
  return <><Link href="/dashboard/support" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground-soft)] hover:text-clinic"><ArrowLeft className="h-4 w-4" />Volver a Ayuda y soporte</Link><PageHeader title={result.data.title} description={`Artículo publicado · ${result.data.category}`} /><article className="glass-card-strong p-5 sm:p-7"><SafeSupportMarkdown markdown={result.data.bodyMarkdown} /></article><p className="mt-4 text-xs text-[var(--foreground-muted)]">Contenido técnico de CliniControl. No constituye orientación médica.</p></>;
}
