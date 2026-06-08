import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AddMemberForm } from "@/components/dashboard/add-member-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getOnboardingStatus } from "@/lib/onboarding";
import { listClinicMembersForClinic, type ClinicMemberRole } from "@/lib/supabase/clinic-members";
import { getClinicPlanContext } from "@/lib/supabase/subscriptions";
import { formatDate } from "@/lib/utils";

const roleLabels: Record<ClinicMemberRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  doctor: "Médico",
  assistant: "Asistente"
};

const statusLabels = {
  active: "Activo",
  invited: "Invitado",
  suspended: "Suspendido"
} as const;

const statusVariant = {
  active: "green",
  invited: "amber",
  suspended: "slate"
} as const;

function formatDoctorUsage(currentDoctorCount: number, doctorLimit: number | null) {
  if (doctorLimit === null) {
    return "Médicos ilimitados";
  }

  return `${currentDoctorCount} de ${doctorLimit} médicos`;
}

export default async function MembersPage() {
  const onboardingStatus = await getOnboardingStatus();

  if (onboardingStatus.state === "unauthenticated") {
    redirect("/login");
  }

  if (onboardingStatus.state !== "complete") {
    redirect("/onboarding");
  }

  const clinicId = onboardingStatus.membership.clinic_id;
  const [planContextResult, membersResult] = await Promise.all([
    getClinicPlanContext(clinicId),
    listClinicMembersForClinic(clinicId)
  ]);

  const planContext = planContextResult.data;
  const members = membersResult.data ?? [];

  return (
    <>
      <PageHeader
        title="Miembros de la clínica"
        description="Administra médicos, administradores y asistentes de tu clínica."
      />

      {planContext ? (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Plan actual</p>
              <p className="mt-1 text-lg font-bold text-ink">{planContext.plan.name}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Médicos registrados</p>
              <p className="mt-1 text-lg font-bold text-ink">
                {formatDoctorUsage(planContext.currentDoctorCount, planContext.doctorLimit)}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Límite del plan</p>
              <p className="mt-1 text-lg font-bold text-ink">
                {planContext.isUnlimitedDoctors ? "Sin límite definido" : `${planContext.doctorLimit} médicos`}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {planContext ? <AddMemberForm canAddDoctor={planContext.canAddDoctor} /> : null}

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="font-bold text-ink">Miembros actuales</h2>
          <p className="mt-1 text-sm text-slate-500">
            Solo miembros de esta clínica son visibles. No se muestran datos de otras clínicas.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3 font-semibold">Nombre</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Rol</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Creado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="px-5 py-4 font-semibold text-ink">{member.full_name ?? "Sin nombre"}</td>
                  <td className="px-5 py-4 text-slate-600">{member.email ?? "Sin correo"}</td>
                  <td className="px-5 py-4 text-slate-600">{roleLabels[member.role]}</td>
                  <td className="px-5 py-4">
                    <Badge variant={statusVariant[member.status]}>{statusLabels[member.status]}</Badge>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{formatDate(member.created_at.slice(0, 10))}</td>
                </tr>
              ))}
              {members.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-center text-slate-500" colSpan={5}>
                    Todavía no hay miembros registrados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
