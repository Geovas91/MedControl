import { ClipboardList, Plug, UserRoundCog } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { getOnboardingStatus } from "@/lib/onboarding";
import { getClinicPlanContext } from "@/lib/supabase/subscriptions";

const settings = [
  {
    title: "Plantillas clinicas",
    description: "Plantillas de notas y consentimientos disponibles para la clinica.",
    icon: ClipboardList,
    href: "/dashboard/settings/clinical-templates"
  },
  {
    title: "Acceso del equipo",
    description: "Roles de médicos y personal administrativo dentro de la clínica.",
    icon: UserRoundCog,
    href: "/dashboard/members"
  },
  {
    title: "Integraciones",
    description: "Conexión personal con Google Calendar e invitaciones de calendario para citas.",
    icon: Plug,
    href: "/dashboard/settings/integrations"
  }
];

function formatDoctorUsage(currentDoctorCount: number, doctorLimit: number | null) {
  if (doctorLimit === null) {
    return "Médicos ilimitados";
  }

  return `${currentDoctorCount} de ${doctorLimit} médicos`;
}

export default async function SettingsPage() {
  const onboardingStatus = await getOnboardingStatus();
  const planContext =
    onboardingStatus.state === "complete"
      ? await getClinicPlanContext(onboardingStatus.membership.clinic_id)
      : { state: "missing" as const, data: null, error: null };

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Administra las opciones disponibles para el espacio clínico y sus integraciones."
      />

      {planContext.data ? (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Plan actual</p>
              <p className="mt-1 text-lg font-bold text-ink">{planContext.data.plan.name}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Médicos registrados</p>
              <p className="mt-1 text-lg font-bold text-ink">
                {formatDoctorUsage(planContext.data.currentDoctorCount, planContext.data.doctorLimit)}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Estado de suscripción</p>
              <p className="mt-1 text-lg font-bold text-ink">{planContext.data.subscription.status}</p>
            </div>
          </div>
        </section>
      ) : planContext.state === "missing" ? (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Sin plan configurado.
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        {settings.map((item) => {
          const Icon = item.icon;

          return (
            <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-teal-50 text-clinic">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-lg font-bold text-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              {item.href ? (
                <ButtonLink href={item.href} variant="secondary" className="mt-5">
                  Abrir configuracion
                </ButtonLink>
              ) : null}
            </article>
          );
        })}
      </section>
    </>
  );
}
