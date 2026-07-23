import { Bell, Building2, ClipboardList, Plug, ShieldCheck, UserRoundCog } from "lucide-react";
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
    title: "Perfil de clínica",
    description: "Nombre comercial, dirección, teléfono y datos básicos de recepción.",
    icon: Building2
  },
  {
    title: "Acceso del equipo",
    description: "Roles de médicos y personal administrativo dentro de la clínica.",
    icon: UserRoundCog
  },
  {
    title: "Notificaciones",
    description: "Recordatorios de citas y alertas de pagos para próximas fases.",
    icon: Bell
  },
  {
    title: "Controles de privacidad",
    description: "Bitácoras, exportación de datos y ajustes de seguridad para flujos clínicos.",
    icon: ShieldCheck
  },
  {
    title: "Integraciones",
    description: "Sincronización de calendario, invitaciones ICS y proveedores de mensajería en preparación.",
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
      : { data: null, error: null };

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Área de configuración del espacio clínico. Los servicios externos todavía no están conectados."
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
                  <p className="mt-1 text-lg font-bold text-ink">
                {planContext.data.subscription?.status ?? "Pendiente"}
              </p>
            </div>
          </div>
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
