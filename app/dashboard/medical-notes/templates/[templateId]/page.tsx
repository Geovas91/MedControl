import { redirect } from "next/navigation";

export default async function MedicalNoteTemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  redirect(`/dashboard/settings/clinical-templates/${encodeURIComponent(templateId)}`);
}
