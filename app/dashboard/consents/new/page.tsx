import { redirect } from "next/navigation";

export default function NewConsentPage() {
  redirect("/dashboard/patients");
}
