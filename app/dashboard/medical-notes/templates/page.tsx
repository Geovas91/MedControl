import { redirect } from "next/navigation";

export default function MedicalNoteTemplatesPage() {
  redirect("/dashboard/settings/clinical-templates?kind=note");
}
